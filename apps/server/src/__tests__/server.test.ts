import { describe, it, expect, beforeEach } from "vitest";
import { SystemClock } from "../infrastructure/clock/system-clock.js";
import { InMemoryUserRepository } from "../infrastructure/repositories/user-repository.js";
import { InMemorySessionRepository } from "../infrastructure/repositories/session-repository.js";
import { InMemoryRoomRepository } from "../infrastructure/repositories/room-repository.js";
import { InMemoryRoomAccessRepository } from "../infrastructure/repositories/room-access-repository.js";
import { InMemoryMembershipRepository } from "../infrastructure/repositories/membership-repository.js";
import { InMemoryPlaybackRepository } from "../infrastructure/repositories/playback-repository.js";
import { UserService } from "../application/user-service.js";
import { SessionService } from "../application/session-service.js";
import { RoomAccessService } from "../application/room-access-service.js";
import { PlaybackService } from "../application/playback-service.js";
import { RoomService } from "../application/room-service.js";
import { PlaybackStatus } from "@omioroom/contracts";

describe("Backend Domain Services", () => {
  let clock: SystemClock;
  let userService: UserService;
  let sessionService: SessionService;
  let accessService: RoomAccessService;
  let playbackService: PlaybackService;
  let roomService: RoomService;

  beforeEach(() => {
    clock = new SystemClock();
    const userRepo = new InMemoryUserRepository();
    const sessionRepo = new InMemorySessionRepository();
    const roomRepo = new InMemoryRoomRepository();
    const accessRepo = new InMemoryRoomAccessRepository();
    const membershipRepo = new InMemoryMembershipRepository();
    const playbackRepo = new InMemoryPlaybackRepository();

    userService = new UserService(userRepo, clock);
    sessionService = new SessionService(sessionRepo, userRepo, clock, 3600000);
    accessService = new RoomAccessService(accessRepo, clock);
    playbackService = new PlaybackService(playbackRepo, clock);
    roomService = new RoomService(
      roomRepo,
      membershipRepo,
      userRepo,
      accessService,
      playbackService,
      clock
    );
  });

  it("creates anonymous users and allows updating display name", async () => {
    const user = await userService.createAnonymousUser();
    expect(user.id).toBeDefined();
    expect(user.kind).toBe("anonymous");
    expect(user.displayName).toBeDefined();

    const updated = await userService.updateDisplayName(user.id, "CinemaLover");
    expect(updated.displayName).toBe("CinemaLover");
    expect(updated.normalizedName).toBe("cinemalover");
    expect(updated.kind).toBe("nickname");
  });

  it("creates and validates sessions", async () => {
    const user = await userService.createAnonymousUser();
    const session = await sessionService.createSession(user.id);
    expect(session.id).toBeDefined();

    const validated = await sessionService.validateSession(session.id);
    expect(validated).not.toBeNull();
    expect(validated?.user.id).toBe(user.id);

    await sessionService.revokeSession(session.id);
    const afterRevoke = await sessionService.validateSession(session.id);
    expect(afterRevoke).toBeNull();
  });

  it("creates public room and allows joining by globalId", async () => {
    const owner = await userService.createAnonymousUser();
    const { room, privateCode } = await roomService.createRoom(owner.id, "Public Watch", "public");

    expect(room.globalId).toMatch(/^\d{6}$/);
    expect(room.visibility).toBe("public");
    expect(privateCode).toBeNull();

    const guest = await userService.createAnonymousUser();
    const joinResult = await roomService.joinRoom(guest.id, room.globalId);
    expect(joinResult.room.id).toBe(room.id);
    expect(joinResult.role).toBe("member");

    const snapshot = await roomService.getRoomSnapshot(room.id, owner.id);
    expect(snapshot.room.participantCount).toBe(2);
  });

  it("creates private room requiring privateCode for guests", async () => {
    const owner = await userService.createAnonymousUser();
    const { room, privateCode } = await roomService.createRoom(owner.id, "Private Movie", "private");

    expect(room.visibility).toBe("private");
    expect(privateCode).toBeDefined();

    const guest = await userService.createAnonymousUser();

    // Joining without code fails
    await expect(roomService.joinRoom(guest.id, room.globalId)).rejects.toThrow("PRIVATE_CODE_REQUIRED");

    // Joining with wrong code fails
    await expect(roomService.joinRoom(guest.id, room.globalId, "wrong-code")).rejects.toThrow(
      "INVALID_PRIVATE_CODE"
    );

    // Joining with correct code succeeds
    const joinResult = await roomService.joinRoom(guest.id, room.globalId, privateCode!);
    expect(joinResult.room.id).toBe(room.id);
  });

  it("enforces 2-participant limit (rejects 3rd participant with ROOM_FULL)", async () => {
    const owner = await userService.createAnonymousUser();
    const { room } = await roomService.createRoom(owner.id, "Duo Only", "public");

    const guest1 = await userService.createAnonymousUser();
    await roomService.joinRoom(guest1.id, room.globalId);

    const guest2 = await userService.createAnonymousUser();
    await expect(roomService.joinRoom(guest2.id, room.globalId)).rejects.toThrow("ROOM_FULL");
  });

  it("allows existing participant to reconnect without consuming an extra slot", async () => {
    const owner = await userService.createAnonymousUser();
    const { room } = await roomService.createRoom(owner.id, "Reconnect Test", "public");

    const guest = await userService.createAnonymousUser();
    await roomService.joinRoom(guest.id, room.globalId);

    // Guest reconnects
    const reconnectResult = await roomService.joinRoom(guest.id, room.globalId);
    expect(reconnectResult.role).toBe("member");

    const snapshot = await roomService.getRoomSnapshot(room.id, owner.id);
    expect(snapshot.room.participantCount).toBe(2);
  });

  it("allows owner to rotate private code which invalidates old code", async () => {
    const owner = await userService.createAnonymousUser();
    const { room, privateCode: oldCode } = await roomService.createRoom(owner.id, "Secret Room", "private");

    const newCode = await roomService.rotatePrivateCode(owner.id, room.id);
    expect(newCode).not.toBe(oldCode);

    const guest = await userService.createAnonymousUser();
    // Old code fails
    await expect(roomService.joinRoom(guest.id, room.globalId, oldCode!)).rejects.toThrow(
      "INVALID_PRIVATE_CODE"
    );

    // New code works
    const joinResult = await roomService.joinRoom(guest.id, room.globalId, newCode);
    expect(joinResult.room.id).toBe(room.id);
  });

  it("processes player commands and deduplicates by commandId", async () => {
    const owner = await userService.createAnonymousUser();
    const { room } = await roomService.createRoom(owner.id, "Playback Test", "public");

    const playCommand = {
      commandId: "00000000-0000-0000-0000-000000000001",
      roomId: room.id,
      type: "play" as const,
      position: 12.5,
    };

    const state1 = await playbackService.handlePlayerCommand(owner.id, playCommand);
    expect(state1.status).toBe(PlaybackStatus.PLAYING);
    expect(state1.anchorPosition).toBe(12.5);
    expect(state1.revision).toBe(1);

    // Duplicate command delivery with same commandId
    const state2 = await playbackService.handlePlayerCommand(owner.id, playCommand);
    expect(state2.revision).toBe(1); // Not incremented again!

    // Pause command with new commandId
    const pauseCommand = {
      commandId: "00000000-0000-0000-0000-000000000002",
      roomId: room.id,
      type: "pause" as const,
      position: 15.0,
    };
    const state3 = await playbackService.handlePlayerCommand(owner.id, pauseCommand);
    expect(state3.status).toBe(PlaybackStatus.PAUSED);
    expect(state3.anchorPosition).toBe(15.0);
    expect(state3.revision).toBe(2);
  });

  it("ensures room creation is idempotent by requestId", async () => {
    const owner = await userService.createAnonymousUser();
    const requestId = "req-12345";
    const res1 = await roomService.createRoom(owner.id, "Movie Night", "private", requestId);
    const res2 = await roomService.createRoom(owner.id, "Movie Night", "private", requestId);

    expect(res1.room.id).toBe(res2.room.id);
    expect(res1.room.globalId).toBe(res2.room.globalId);
    expect(res1.privateCode).toBe(res2.privateCode);
  });

  it("enforces rate limits on rapid join attempts", async () => {
    const attacker = await userService.createAnonymousUser();
    // Exceed rate limit (15 attempts)
    let rateLimited = false;
    for (let i = 0; i < 20; i++) {
      try {
        await roomService.joinRoom(attacker.id, "999999");
      } catch (err: any) {
        if (err.message === "RATE_LIMITED") {
          rateLimited = true;
          break;
        }
      }
    }
    expect(rateLimited).toBe(true);
  });
});
