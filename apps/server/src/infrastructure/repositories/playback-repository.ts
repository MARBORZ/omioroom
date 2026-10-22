import type { RoomPlaybackStateDto } from "@omioroom/contracts";

export interface PlaybackRepository {
  findByRoomId(roomId: string): Promise<RoomPlaybackStateDto | null>;
  save(state: RoomPlaybackStateDto): Promise<void>;
  hasProcessedCommand(commandId: string): Promise<boolean>;
  markCommandProcessed(commandId: string): Promise<void>;
}

export class InMemoryPlaybackRepository implements PlaybackRepository {
  private readonly states = new Map<string, RoomPlaybackStateDto>();
  private readonly processedCommands = new Set<string>();

  async findByRoomId(roomId: string): Promise<RoomPlaybackStateDto | null> {
    const s = this.states.get(roomId);
    return s ? { ...s } : null;
  }

  async save(state: RoomPlaybackStateDto): Promise<void> {
    this.states.set(state.roomId, { ...state });
  }

  async hasProcessedCommand(commandId: string): Promise<boolean> {
    return this.processedCommands.has(commandId);
  }

  async markCommandProcessed(commandId: string): Promise<void> {
    this.processedCommands.add(commandId);
    // Maintain a bounded set size to prevent memory leaks
    if (this.processedCommands.size > 10000) {
      const first = this.processedCommands.values().next().value;
      if (first) {
        this.processedCommands.delete(first);
      }
    }
  }
}
