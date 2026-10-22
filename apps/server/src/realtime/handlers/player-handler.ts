import type { Socket, Server } from "socket.io";
import {
  ClientCommand,
  ServerEvent,
  playerCommandPayloadSchema,
  playerSyncRequestPayloadSchema,
  commandResultSuccess,
  commandResultError,
  createProtocolError,
  ErrorCode,
  type CommandEnvelope,
  type PlayerCommandPayload,
  type PlayerSyncRequestPayload,
} from "@omioroom/contracts";
import type { AuthenticatedSocketData } from "../middleware/auth-middleware.js";
import type { PlaybackService } from "../../application/playback-service.js";

export function registerPlayerHandlers(
  io: Server,
  socket: Socket<any, any, any, AuthenticatedSocketData>,
  playbackService: PlaybackService
) {
  // player:command
  socket.on(
    ClientCommand.PLAYER_COMMAND,
    async (
      envelope: CommandEnvelope<PlayerCommandPayload>,
      ack?: (res: any) => void
    ) => {
      const requestId = envelope?.requestId || "player-command";
      try {
        const parsed = playerCommandPayloadSchema.safeParse(envelope.payload);
        if (!parsed.success) {
          const err = createProtocolError(
            ErrorCode.INVALID_PAYLOAD,
            parsed.error.errors[0]?.message || "Invalid player command payload"
          );
          return ack?.(commandResultError(requestId, err));
        }

        const state = await playbackService.handlePlayerCommand(
          socket.data.user.id,
          parsed.data
        );

        // Broadcast authoritative player state to all participants in this room
        io.to(`room:${parsed.data.roomId}`).emit(ServerEvent.PLAYER_STATE, state);

        ack?.(commandResultSuccess(requestId, state));
      } catch (err: any) {
        ack?.(
          commandResultError(
            requestId,
            createProtocolError(ErrorCode.INTERNAL_ERROR, err?.message || "Playback error")
          )
        );
      }
    }
  );

  // player:sync-request
  socket.on(
    ClientCommand.PLAYER_SYNC_REQUEST,
    async (
      envelope: CommandEnvelope<PlayerSyncRequestPayload>,
      ack?: (res: any) => void
    ) => {
      const requestId = envelope?.requestId || "sync-request";
      try {
        const parsed = playerSyncRequestPayloadSchema.safeParse(envelope.payload);
        if (!parsed.success) {
          return ack?.(
            commandResultError(
              requestId,
              createProtocolError(ErrorCode.INVALID_PAYLOAD, "Invalid sync request")
            )
          );
        }

        const state = await playbackService.getPlaybackState(parsed.data.roomId);
        if (!state) {
          return ack?.(
            commandResultError(
              requestId,
              createProtocolError(ErrorCode.ROOM_NOT_FOUND, "Room not found")
            )
          );
        }

        ack?.(commandResultSuccess(requestId, state));
      } catch (err: any) {
        ack?.(
          commandResultError(
            requestId,
            createProtocolError(ErrorCode.INTERNAL_ERROR, err?.message || "Sync error")
          )
        );
      }
    }
  );
}
