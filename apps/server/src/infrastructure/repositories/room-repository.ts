import type { RoomStatus, RoomVisibility } from "@omioroom/contracts";

export interface RoomRecord {
  id: string;
  globalId: string;
  ownerUserId: string;
  title: string;
  visibility: RoomVisibility;
  status: RoomStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  revision: number;
}

export interface RoomRepository {
  findById(id: string): Promise<RoomRecord | null>;
  findByGlobalId(globalId: string): Promise<RoomRecord | null>;
  findByOwnerUserId(ownerUserId: string): Promise<RoomRecord[]>;
  findActiveRooms(): Promise<RoomRecord[]>;
  save(room: RoomRecord): Promise<void>;
  delete(id: string): Promise<void>;
  isGlobalIdTaken(globalId: string): Promise<boolean>;
}

export class InMemoryRoomRepository implements RoomRepository {
  private readonly rooms = new Map<string, RoomRecord>();
  private readonly globalIdMap = new Map<string, string>(); // globalId -> roomId

  async findById(id: string): Promise<RoomRecord | null> {
    return this.rooms.get(id) ?? null;
  }

  async findByGlobalId(globalId: string): Promise<RoomRecord | null> {
    const roomId = this.globalIdMap.get(globalId);
    if (!roomId) return null;
    return this.rooms.get(roomId) ?? null;
  }

  async findByOwnerUserId(ownerUserId: string): Promise<RoomRecord[]> {
    const result: RoomRecord[] = [];
    for (const room of this.rooms.values()) {
      if (room.ownerUserId === ownerUserId && room.status === "active") {
        result.push({ ...room });
      }
    }
    return result;
  }

  async findActiveRooms(): Promise<RoomRecord[]> {
    const result: RoomRecord[] = [];
    for (const room of this.rooms.values()) {
      if (room.status === "active") {
        result.push({ ...room });
      }
    }
    return result;
  }

  async save(room: RoomRecord): Promise<void> {
    this.rooms.set(room.id, { ...room });
    if (room.status === "active") {
      this.globalIdMap.set(room.globalId, room.id);
    } else {
      this.globalIdMap.delete(room.globalId);
    }
  }

  async delete(id: string): Promise<void> {
    const room = this.rooms.get(id);
    if (room) {
      this.globalIdMap.delete(room.globalId);
      this.rooms.delete(id);
    }
  }

  async isGlobalIdTaken(globalId: string): Promise<boolean> {
    const roomId = this.globalIdMap.get(globalId);
    if (!roomId) return false;
    const room = this.rooms.get(roomId);
    return room !== undefined && room.status === "active";
  }
}
