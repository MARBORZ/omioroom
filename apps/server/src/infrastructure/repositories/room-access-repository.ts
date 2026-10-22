export interface RoomPrivateAccessRecord {
  roomId: string;
  secretHash: string;
  rotatedAt: string;
  revokedAt: string | null;
}

export interface RoomAccessRepository {
  findByRoomId(roomId: string): Promise<RoomPrivateAccessRecord | null>;
  save(access: RoomPrivateAccessRecord): Promise<void>;
  revoke(roomId: string, now: string): Promise<void>;
}

export class InMemoryRoomAccessRepository implements RoomAccessRepository {
  private readonly accessMap = new Map<string, RoomPrivateAccessRecord>();

  async findByRoomId(roomId: string): Promise<RoomPrivateAccessRecord | null> {
    return this.accessMap.get(roomId) ?? null;
  }

  async save(access: RoomPrivateAccessRecord): Promise<void> {
    this.accessMap.set(access.roomId, { ...access });
  }

  async revoke(roomId: string, now: string): Promise<void> {
    const record = this.accessMap.get(roomId);
    if (record) {
      record.revokedAt = now;
    }
  }
}
