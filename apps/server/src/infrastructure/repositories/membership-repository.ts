import type { RoomRole } from "@omioroom/contracts";

export interface RoomMembershipRecord {
  roomId: string;
  userId: string;
  role: RoomRole;
  joinedAt: string;
  lastActiveAt: string;
  isOnline: boolean;
}

export interface MembershipRepository {
  findMemberships(roomId: string): Promise<RoomMembershipRecord[]>;
  findMembership(roomId: string, userId: string): Promise<RoomMembershipRecord | null>;
  save(membership: RoomMembershipRecord): Promise<void>;
  remove(roomId: string, userId: string): Promise<void>;
  countActive(roomId: string): Promise<number>;
}

export class InMemoryMembershipRepository implements MembershipRepository {
  // key: `${roomId}:${userId}`
  private readonly memberships = new Map<string, RoomMembershipRecord>();

  private key(roomId: string, userId: string): string {
    return `${roomId}:${userId}`;
  }

  async findMemberships(roomId: string): Promise<RoomMembershipRecord[]> {
    const list: RoomMembershipRecord[] = [];
    for (const m of this.memberships.values()) {
      if (m.roomId === roomId) {
        list.push({ ...m });
      }
    }
    return list;
  }

  async findMembership(roomId: string, userId: string): Promise<RoomMembershipRecord | null> {
    return this.memberships.get(this.key(roomId, userId)) ?? null;
  }

  async save(membership: RoomMembershipRecord): Promise<void> {
    this.memberships.set(this.key(membership.roomId, membership.userId), { ...membership });
  }

  async remove(roomId: string, userId: string): Promise<void> {
    this.memberships.delete(this.key(roomId, userId));
  }

  async countActive(roomId: string): Promise<number> {
    let count = 0;
    for (const m of this.memberships.values()) {
      if (m.roomId === roomId && m.isOnline) {
        count++;
      }
    }
    return count;
  }
}
