import type {
  RoomVisibility,
  RoomSummaryDto,
  RoomSnapshotDto,
  ParticipantDto,
  RoomRole,
} from "@omioroom/contracts";
import { MAX_ROOM_PARTICIPANTS } from "@omioroom/contracts";
import type { RoomRepository, RoomRecord } from "../infrastructure/repositories/room-repository.js";
import type { MembershipRepository } from "../infrastructure/repositories/membership-repository.js";
import type { UserRepository } from "../infrastructure/repositories/user-repository.js";
import type { RoomAccessService } from "./room-access-service.js";
import type { PlaybackService } from "./playback-service.js";
import type { Clock } from "../infrastructure/clock/system-clock.js";
import { generateId, generateGlobalRoomId } from "../infrastructure/security/crypto.js";
import { RateLimiter } from "../infrastructure/security/rate-limiter.js";

export class RoomService {
  private readonly joinRateLimiter = new RateLimiter(60_000, 15);
  private readonly createIdempotencyMap = new Map<
    string,
    { room: RoomRecord; privateCode: string | null; timestamp: number }
  >();

  constructor(
    private readonly roomRepository: RoomRepository,
    private readonly membershipRepository: MembershipRepository,
    private readonly userRepository: UserRepository,
    private readonly accessService: RoomAccessService,
    private readonly playbackService: PlaybackService,
    private readonly clock: Clock
  ) {}

  private async generateUniqueGlobalId(): Promise<string> {
    for (let attempts = 0; attempts < 50; attempts++) {
      const code = generateGlobalRoomId();
      const taken = await this.roomRepository.isGlobalIdTaken(code);
      if (!taken) return code;
    }
    throw new Error("GLOBAL_ID_GENERATION_EXHAUSTED");
  }

  async createRoom(
    ownerUserId: string,
    title = "Watch Room",
    visibility: RoomVisibility = "private",
    requestId?: string
  ): Promise<{ room: RoomRecord; privateCode: string | null }> {
    if (requestId && this.createIdempotencyMap.has(requestId)) {
      return this.createIdempotencyMap.get(requestId)!;
    }

    const id = generateId();
    const globalId = await this.generateUniqueGlobalId();
    const now = this.clock.isoNow();

    const room: RoomRecord = {
      id,
      globalId,
      ownerUserId,
      title: title.trim() || "Watch Room",
      visibility,
      status: "active",
      createdAt: now,
      updatedAt: now,
      expiresAt: null,
      revision: 1,
    };

    await this.roomRepository.save(room);

    // Add owner membership
    await this.membershipRepository.save({
      roomId: id,
      userId: ownerUserId,
      role: "owner",
      joinedAt: now,
      lastActiveAt: now,
      isOnline: true,
    });

    // Initialize playback state
    await this.playbackService.initPlaybackState(id);

    // If private, generate private code
    let privateCode: string | null = null;
    if (visibility === "private") {
      const accessResult = await this.accessService.createPrivateAccess(id);
      privateCode = accessResult.privateCode;
    }

    const result = { room, privateCode };
    if (requestId) {
      this.createIdempotencyMap.set(requestId, { ...result, timestamp: Date.now() });
      // Prune entries older than 5 minutes
      if (this.createIdempotencyMap.size > 200) {
        const threshold = Date.now() - 300_000;
        for (const [key, val] of this.createIdempotencyMap.entries()) {
          if (val.timestamp < threshold) this.createIdempotencyMap.delete(key);
        }
      }
    }

    return result;
  }

  async joinRoom(
    userId: string,
    globalId: string,
    privateCode?: string
  ): Promise<{ room: RoomRecord; role: RoomRole }> {
    const isAllowed = this.joinRateLimiter.checkAndRecord(userId);
    if (!isAllowed) {
      throw new Error("RATE_LIMITED");
    }

    const room = await this.roomRepository.findByGlobalId(globalId);
    if (!room || room.status !== "active") {
      throw new Error("ROOM_NOT_FOUND");
    }

    const now = this.clock.isoNow();
    const isOwner = room.ownerUserId === userId;

    // Check private access if private and not the owner
    if (room.visibility === "private" && !isOwner) {
      if (!privateCode) {
        throw new Error("PRIVATE_CODE_REQUIRED");
      }
      const isValid = await this.accessService.verifyAccess(room.id, privateCode);
      if (!isValid) {
        throw new Error("INVALID_PRIVATE_CODE");
      }
    }

    // Check membership & capacity
    const existingMembership = await this.membershipRepository.findMembership(room.id, userId);
    if (existingMembership) {
      // Reconnecting participant: seat may have been taken while offline
      if (!existingMembership.isOnline) {
        const online = await this.membershipRepository.countActive(room.id);
        if (online >= MAX_ROOM_PARTICIPANTS) {
          throw new Error("ROOM_FULL");
        }
      }
      this.joinRateLimiter.reset(userId);
      existingMembership.isOnline = true;
      existingMembership.lastActiveAt = now;
      await this.membershipRepository.save(existingMembership);
      return { room, role: existingMembership.role };
    }

    // New participant joining: check capacity
    const activeCount = await this.membershipRepository.countActive(room.id);
    if (activeCount >= MAX_ROOM_PARTICIPANTS) {
      throw new Error("ROOM_FULL");
    }

    const role: RoomRole = isOwner ? "owner" : "member";
    await this.membershipRepository.save({
      roomId: room.id,
      userId,
      role,
      joinedAt: now,
      lastActiveAt: now,
      isOnline: true,
    });

    // Reset rate limiter on successful join
    this.joinRateLimiter.reset(userId);

    return { room, role };
  }

  async leaveRoom(userId: string, roomId: string): Promise<void> {
    const membership = await this.membershipRepository.findMembership(roomId, userId);
    if (membership) {
      membership.isOnline = false;
      membership.lastActiveAt = this.clock.isoNow();
      await this.membershipRepository.save(membership);
    }
  }

  async closeRoom(ownerUserId: string, roomId: string): Promise<RoomRecord> {
    const room = await this.roomRepository.findById(roomId);
    if (!room) {
      throw new Error("ROOM_NOT_FOUND");
    }
    if (room.ownerUserId !== ownerUserId) {
      throw new Error("FORBIDDEN");
    }
    if (room.status !== "active") {
      throw new Error("ROOM_CLOSED");
    }

    const now = this.clock.isoNow();
    room.status = "closed";
    room.updatedAt = now;
    room.revision += 1;

    await this.roomRepository.save(room);
    return room;
  }

  async setVisibility(
    ownerUserId: string,
    roomId: string,
    visibility: RoomVisibility,
    expectedRevision?: number
  ): Promise<{ room: RoomRecord; newPrivateCode: string | null }> {
    const room = await this.roomRepository.findById(roomId);
    if (!room) {
      throw new Error("ROOM_NOT_FOUND");
    }
    if (room.ownerUserId !== ownerUserId) {
      throw new Error("FORBIDDEN");
    }
    if (room.status !== "active") {
      throw new Error("ROOM_CLOSED");
    }
    if (expectedRevision !== undefined && room.revision !== expectedRevision) {
      throw new Error("REVISION_CONFLICT");
    }

    const now = this.clock.isoNow();
    let newPrivateCode: string | null = null;

    if (visibility === "private" && room.visibility !== "private") {
      const access = await this.accessService.createPrivateAccess(room.id);
      newPrivateCode = access.privateCode;
    } else if (visibility === "public" && room.visibility !== "public") {
      await this.accessService.revokePrivateAccess(room.id);
    }

    room.visibility = visibility;
    room.updatedAt = now;
    room.revision += 1;

    await this.roomRepository.save(room);
    return { room, newPrivateCode };
  }

  async rotatePrivateCode(ownerUserId: string, roomId: string): Promise<string> {
    const room = await this.roomRepository.findById(roomId);
    if (!room) {
      throw new Error("ROOM_NOT_FOUND");
    }
    if (room.ownerUserId !== ownerUserId) {
      throw new Error("FORBIDDEN");
    }
    if (room.status !== "active") {
      throw new Error("ROOM_CLOSED");
    }
    if (room.visibility !== "private") {
      throw new Error("INVALID_PAYLOAD");
    }

    const newCode = await this.accessService.rotatePrivateAccess(roomId);
    room.updatedAt = this.clock.isoNow();
    room.revision += 1;
    await this.roomRepository.save(room);

    return newCode;
  }

  async revokePrivateCode(ownerUserId: string, roomId: string): Promise<RoomRecord> {
    const room = await this.roomRepository.findById(roomId);
    if (!room) {
      throw new Error("ROOM_NOT_FOUND");
    }
    if (room.ownerUserId !== ownerUserId) {
      throw new Error("FORBIDDEN");
    }
    if (room.status !== "active") {
      throw new Error("ROOM_CLOSED");
    }

    await this.accessService.revokePrivateAccess(roomId);
    room.updatedAt = this.clock.isoNow();
    room.revision += 1;
    await this.roomRepository.save(room);
    return room;
  }

  async resolveRoomId(globalId: string): Promise<string | null> {
    const room = await this.roomRepository.findByGlobalId(globalId);
    return room ? room.id : null;
  }

  /**
   * Authorizes a realtime action inside a room: the room must be active and the
   * user must be an online participant. Client-supplied roomId is never trusted alone.
   */
  async assertActiveMember(userId: string, roomId: string): Promise<void> {
    const room = await this.roomRepository.findById(roomId);
    if (!room) {
      throw new Error("ROOM_NOT_FOUND");
    }
    if (room.status !== "active") {
      throw new Error("ROOM_CLOSED");
    }
    const membership = await this.membershipRepository.findMembership(roomId, userId);
    if (!membership || !membership.isOnline) {
      throw new Error("FORBIDDEN");
    }
  }

  async isMember(userId: string, roomId: string): Promise<boolean> {
    return (await this.membershipRepository.findMembership(roomId, userId)) !== null;
  }

  async getRoomSnapshot(roomId: string, viewerUserId: string): Promise<RoomSnapshotDto> {
    const room = await this.roomRepository.findById(roomId);
    if (!room) {
      throw new Error("ROOM_NOT_FOUND");
    }

    const memberships = await this.membershipRepository.findMemberships(roomId);
    const activeParticipants: ParticipantDto[] = [];

    for (const m of memberships) {
      const user = await this.userRepository.findById(m.userId);
      activeParticipants.push({
        userId: m.userId,
        displayName: user?.displayName ?? "Unknown",
        role: m.role,
        joinedAt: m.joinedAt,
        isOnline: m.isOnline,
      });
    }

    const playback = await this.playbackService.getPlaybackState(roomId);
    const isOwner = room.ownerUserId === viewerUserId;

    const summary: RoomSummaryDto = {
      id: room.id,
      globalId: room.globalId,
      ownerUserId: room.ownerUserId,
      title: room.title,
      visibility: room.visibility,
      status: room.status,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      participantCount: activeParticipants.filter((p) => p.isOnline).length,
      revision: room.revision,
    };

    return {
      room: summary,
      isOwner,
      participants: activeParticipants,
      playback,
    };
  }

  async listOwnerRooms(ownerUserId: string): Promise<RoomSummaryDto[]> {
    const rooms = await this.roomRepository.findByOwnerUserId(ownerUserId);
    const summaries: RoomSummaryDto[] = [];

    for (const room of rooms) {
      const activeCount = await this.membershipRepository.countActive(room.id);
      summaries.push({
        id: room.id,
        globalId: room.globalId,
        ownerUserId: room.ownerUserId,
        title: room.title,
        visibility: room.visibility,
        status: room.status,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
        participantCount: activeCount,
        revision: room.revision,
      });
    }

    return summaries;
  }

  async cleanupInactiveRooms(maxInactiveMs = 30 * 60 * 1000): Promise<number> {
    const activeRooms = await this.roomRepository.findActiveRooms();
    const now = this.clock.now();
    let cleaned = 0;

    for (const room of activeRooms) {
      const memberships = await this.membershipRepository.findMemberships(room.id);
      const onlineCount = memberships.filter((m) => m.isOnline).length;
      if (onlineCount === 0) {
        const lastActive = memberships.reduce((latest, m) => {
          const t = new Date(m.lastActiveAt).getTime();
          return Math.max(latest, isNaN(t) ? 0 : t);
        }, new Date(room.createdAt).getTime());

        if (now - lastActive > maxInactiveMs) {
          room.status = "closed";
          room.updatedAt = this.clock.isoNow();
          await this.roomRepository.save(room);
          cleaned++;
        }
      }
    }

    return cleaned;
  }
}
