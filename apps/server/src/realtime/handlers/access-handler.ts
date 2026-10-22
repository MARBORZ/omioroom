import type { Socket, Server } from "socket.io";
import {
  ClientCommand,
  ServerEvent,
  setVisibilityPayloadSchema,
  rotatePrivateCodePayloadSchema,
  commandResultSuccess,
  commandResultError,
  createProtocolError,
  ErrorCode,
  type CommandEnvelope,
  type SetVisibilityPayload,
  type RotatePrivateCodePayload,
  type RoomOwnerAccessDto,
} from "@omioroom/contracts";
import type { AuthenticatedSocketData } from "../middleware/auth-middleware.js";
import type { RoomService } from "../../application/room-service.js";

export function registerAccessHandlers(
  io: Server,
  socket: Socket<any, any, any, AuthenticatedSocketData>,
  roomService: RoomService
) {
  // room:set-visibility
  socket.on(
    ClientCommand.ROOM_SET_VISIBILITY,
    async (
      envelope: CommandEnvelope<SetVisibilityPayload>,
      ack?: (res: any) => void
    ) => {
      const requestId = envelope?.requestId || "set-visibility";
      try {
        const parsed = setVisibilityPayloadSchema.safeParse(envelope.payload);
        if (!parsed.success) {
          const err = createProtocolError(
            ErrorCode.INVALID_PAYLOAD,
            parsed.error.errors[0]?.message || "Invalid payload"
          );
          return ack?.(commandResultError(requestId, err));
        }

        const { room, newPrivateCode } = await roomService.setVisibility(
          socket.data.user.id,
          parsed.data.roomId,
          parsed.data.visibility,
          parsed.data.expectedRevision
        );

        // Broadcast safe event without secret
        io.to(`room:${room.id}`).emit(ServerEvent.ROOM_ACCESS_UPDATED, {
          roomId: room.id,
          visibility: room.visibility,
          revision: room.revision,
        });

        // Return owner-only access result if code was created
        const ownerAccess: RoomOwnerAccessDto | null = newPrivateCode
          ? {
              roomId: room.id,
              privateCode: newPrivateCode,
              rotatedAt: room.updatedAt,
            }
          : null;

        ack?.(commandResultSuccess(requestId, { room, ownerAccess }));
      } catch (err: any) {
        let code: ErrorCode = ErrorCode.INTERNAL_ERROR;
        if (err.message === "FORBIDDEN") code = ErrorCode.FORBIDDEN;
        else if (err.message === "ROOM_NOT_FOUND") code = ErrorCode.ROOM_NOT_FOUND;
        else if (err.message === "REVISION_CONFLICT") code = ErrorCode.REVISION_CONFLICT;

        ack?.(commandResultError(requestId, createProtocolError(code, err.message)));
      }
    }
  );

  // room:rotate-private-code
  socket.on(
    ClientCommand.ROOM_ROTATE_PRIVATE_CODE,
    async (
      envelope: CommandEnvelope<RotatePrivateCodePayload>,
      ack?: (res: any) => void
    ) => {
      const requestId = envelope?.requestId || "rotate-code";
      try {
        const parsed = rotatePrivateCodePayloadSchema.safeParse(envelope.payload);
        if (!parsed.success) {
          return ack?.(
            commandResultError(
              requestId,
              createProtocolError(ErrorCode.INVALID_PAYLOAD, "Invalid payload")
            )
          );
        }

        const newPrivateCode = await roomService.rotatePrivateCode(
          socket.data.user.id,
          parsed.data.roomId
        );

        // Broadcast safe notification
        io.to(`room:${parsed.data.roomId}`).emit(ServerEvent.ROOM_ACCESS_UPDATED, {
          roomId: parsed.data.roomId,
          visibility: "private",
        });

        const ownerResult: RoomOwnerAccessDto = {
          roomId: parsed.data.roomId,
          privateCode: newPrivateCode,
          rotatedAt: new Date().toISOString(),
        };

        ack?.(commandResultSuccess(requestId, ownerResult));
      } catch (err: any) {
        let code: ErrorCode = ErrorCode.INTERNAL_ERROR;
        if (err.message === "FORBIDDEN") code = ErrorCode.FORBIDDEN;
        else if (err.message === "ROOM_NOT_FOUND") code = ErrorCode.ROOM_NOT_FOUND;

        ack?.(commandResultError(requestId, createProtocolError(code, err.message)));
      }
    }
  );
}
