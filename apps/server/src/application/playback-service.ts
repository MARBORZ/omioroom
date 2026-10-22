import type {
  PlayerCommandPayload,
  RoomPlaybackStateDto,
} from "@omioroom/contracts";
import {
  calculateExpectedPosition,
  PlaybackStatus,
} from "@omioroom/contracts";
import type { PlaybackRepository } from "../infrastructure/repositories/playback-repository.js";
import type { Clock } from "../infrastructure/clock/system-clock.js";

export class PlaybackService {
  constructor(
    private readonly playbackRepository: PlaybackRepository,
    private readonly clock: Clock
  ) {}

  async getPlaybackState(roomId: string): Promise<RoomPlaybackStateDto | null> {
    return this.playbackRepository.findByRoomId(roomId);
  }

  async initPlaybackState(roomId: string): Promise<RoomPlaybackStateDto> {
    const now = this.clock.now();
    const state: RoomPlaybackStateDto = {
      roomId,
      media: null,
      status: PlaybackStatus.PAUSED,
      anchorPosition: 0,
      anchorServerTime: now,
      playbackRate: 1.0,
      revision: 0,
      updatedByUserId: null,
    };
    await this.playbackRepository.save(state);
    return state;
  }

  async handlePlayerCommand(
    userId: string,
    payload: PlayerCommandPayload
  ): Promise<RoomPlaybackStateDto> {
    // 1. Deduplication by commandId
    if (await this.playbackRepository.hasProcessedCommand(payload.commandId)) {
      const existing = await this.playbackRepository.findByRoomId(payload.roomId);
      if (existing) return existing;
    }

    let state = await this.playbackRepository.findByRoomId(payload.roomId);
    if (!state) {
      state = await this.initPlaybackState(payload.roomId);
    }

    // 2. Revision conflict check if expectedRevision is supplied
    if (
      payload.expectedRevision !== undefined &&
      payload.expectedRevision < state.revision
    ) {
      // Stale command: ignore and return current state
      return state;
    }

    const now = this.clock.now();
    let newStatus = state.status;
    let newPosition = state.anchorPosition;
    let newRate = state.playbackRate;
    let newMedia = state.media;

    switch (payload.type) {
      case "play": {
        newStatus = PlaybackStatus.PLAYING;
        newPosition =
          payload.position !== undefined
            ? Math.max(0, payload.position)
            : calculateExpectedPosition(state, now);
        break;
      }
      case "pause": {
        newStatus = PlaybackStatus.PAUSED;
        newPosition =
          payload.position !== undefined
            ? Math.max(0, payload.position)
            : calculateExpectedPosition(state, now);
        break;
      }
      case "seek": {
        newPosition = Math.max(0, payload.position ?? 0);
        break;
      }
      case "change-media": {
        if (payload.media) {
          newMedia = payload.media;
          newPosition = 0;
          newStatus = PlaybackStatus.PAUSED;
        }
        break;
      }
      case "set-rate": {
        if (payload.playbackRate && payload.playbackRate > 0) {
          newPosition = calculateExpectedPosition(state, now);
          newRate = payload.playbackRate;
        }
        break;
      }
      case "buffering": {
        newStatus = PlaybackStatus.BUFFERING;
        newPosition =
          payload.position !== undefined
            ? Math.max(0, payload.position)
            : calculateExpectedPosition(state, now);
        break;
      }
    }

    const updatedState: RoomPlaybackStateDto = {
      roomId: state.roomId,
      media: newMedia,
      status: newStatus,
      anchorPosition: newPosition,
      anchorServerTime: now,
      playbackRate: newRate,
      revision: state.revision + 1,
      updatedByUserId: userId,
    };

    await this.playbackRepository.save(updatedState);
    await this.playbackRepository.markCommandProcessed(payload.commandId);

    return updatedState;
  }
}
