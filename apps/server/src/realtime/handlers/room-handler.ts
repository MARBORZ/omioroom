import type { Socket, Server } from "socket.io";
import {
  ClientCommand,
  ServerEvent,
  createRoomPayloadSchema,
  joinRoomPayloadSchema,
  getRoomPayloadSchema,
  closeRoomPayloadSchema,
  commandResultSuccess,
  commandResultError,
  createProtocolError,
  ErrorCode,
  type CommandEnvelope,
  type CreateRoomPayload,
  type JoinRoomPayload,
  type LeaveRoomPayload,
  type GetRoomPayload,
  type CloseRoomPayload,
  type RoomOwnerAccessDto,
} from "@omioroom/contracts";
import type { AuthenticatedSocketData } from "../middleware/auth-middleware.js";
import type { RoomService } from "../../application/room-service.js";

export function registerRoomHandlers(
  io: Server,
  socket: Socket<any, any, any, AuthenticatedSocketData>,
  roomService: RoomService
) {
  // room:create
  socket.on(
    ClientCommand.ROOM_CREATE,
    async (
      envelope: CommandEnvelope<CreateRoomPayload>,
      ack?: (res: any) => void
    ) => {
      const requestId = envelope?.requestId || "create-room";
      try {
        const parsed = createRoomPayloadSchema.safeParse(envelope.payload || {});
        if (!parsed.success) {
          const err = createProtocolError(
            ErrorCode.INVALID_PAYLOAD,
            parsed.error.errors[0]?.message || "Invalid room creation payload"
          );
          return ack?.(commandResultError(requestId, err));
        }

        const { room, privateCode } = await roomService.createRoom(
          socket.data.user.id,
          parsed.data.title,
          parsed.data.visibility,
          requestId
        );

        socket.join(`room:${room.id}`);
        socket.data.activeRoomId = room.id;

        const snapshot = await roomService.getRoomSnapshot(room.id, socket.data.user.id);

        const ownerAccess: RoomOwnerAccessDto | null = privateCode
          ? {
              roomId: room.id,
              privateCode,
              rotatedAt: room.createdAt,
            }
          : null;

        ack?.(commandResultSuccess(requestId, { snapshot, ownerAccess }));
      } catch (err: any) {
        ack?.(
          commandResultError(
            requestId,
            createProtocolError(ErrorCode.INTERNAL_ERROR, err?.message || "Failed to create room")
          )
        );
      }
    }
  );

  // room:join
  socket.on(
    ClientCommand.ROOM_JOIN,
    async (
      envelope: CommandEnvelope<JoinRoomPayload>,
      ack?: (res: any) => void
    ) => {
      const requestId = envelope?.requestId || "join-room";
      try {
        const parsed = joinRoomPayloadSchema.safeParse(envelope.payload);
        if (!parsed.success) {
          const err = createProtocolError(
            ErrorCode.INVALID_PAYLOAD,
            parsed.error.errors[0]?.message || "Invalid join payload"
          );
          return ack?.(commandResultError(requestId, err));
        }

        const { room } = await roomService.joinRoom(
          socket.data.user.id,
          parsed.data.globalId,
          parsed.data.privateCode
        );

        socket.join(`room:${room.id}`);
        socket.data.activeRoomId = room.id;

        const snapshot = await roomService.getRoomSnapshot(room.id, socket.data.user.id);

        // Notify other participants in the room
        socket.to(`room:${room.id}`).emit(ServerEvent.ROOM_PARTICIPANT_JOINED, {
          roomId: room.id,
          participant: {
            userId: socket.data.user.id,
            displayName: socket.data.user.displayName,
            role: snapshot.isOwner ? "owner" : "member",
            joinedAt: new Date().toISOString(),
            isOnline: true,
          },
        });

        // Also emit snapshot update to everyone in room so participant counts match
        io.to(`room:${room.id}`).emit(ServerEvent.ROOM_UPDATED, {
          roomId: room.id,
          participantCount: snapshot.participants.filter((p) => p.isOnline).length,
        });

        ack?.(commandResultSuccess(requestId, snapshot));
      } catch (err: any) {
        let code: ErrorCode = ErrorCode.INTERNAL_ERROR;
        if (err.message === "ROOM_NOT_FOUND") code = ErrorCode.ROOM_NOT_FOUND;
        else if (err.message === "ROOM_FULL") code = ErrorCode.ROOM_FULL;
        else if (err.message === "PRIVATE_CODE_REQUIRED") code = ErrorCode.PRIVATE_CODE_REQUIRED;
        else if (err.message === "INVALID_PRIVATE_CODE") code = ErrorCode.INVALID_PRIVATE_CODE;
        else if (err.message === "RATE_LIMITED") code = ErrorCode.RATE_LIMITED;

        ack?.(commandResultError(requestId, createProtocolError(code, err.message)));
      }
    }
  );

  // room:leave
  socket.on(
    ClientCommand.ROOM_LEAVE,
    async (
      envelope: CommandEnvelope<LeaveRoomPayload>,
      ack?: (res: any) => void
    ) => {
      const requestId = envelope?.requestId || "leave-room";
      const roomId = envelope.payload?.roomId || socket.data.activeRoomId;
      if (roomId) {
        socket.leave(`room:${roomId}`);
        await roomService.leaveRoom(socket.data.user.id, roomId);
        socket.data.activeRoomId = undefined;

        io.to(`room:${roomId}`).emit(ServerEvent.ROOM_PARTICIPANT_LEFT, {
          roomId,
          userId: socket.data.user.id,
        });
      }
      ack?.(commandResultSuccess(requestId, { left: true }));
    }
  );

  // room:get
  socket.on(
    ClientCommand.ROOM_GET,
    async (
      envelope: CommandEnvelope<GetRoomPayload>,
      ack?: (res: any) => void
    ) => {
      const requestId = envelope?.requestId || "get-room";
      try {
        const parsed = getRoomPayloadSchema.safeParse(envelope.payload);
        if (!parsed.success) {
          return ack?.(
            commandResultError(
              requestId,
              createProtocolError(ErrorCode.INVALID_PAYLOAD, "Invalid get payload")
            )
          );
        }

        let targetRoomId = parsed.data.roomId;
        if (!targetRoomId && parsed.data.globalId) {
          // Find room by globalId
          const snapshot = await roomService.getRoomSnapshot(
            parsed.data.globalId,
            socket.data.user.id
          ).catch(() => null);
          if (snapshot) {
            return ack?.(commandResultSuccess(requestId, snapshot));
          }
        }

        if (!targetRoomId) {
          return ack?.(
            commandResultError(
              requestId,
              createProtocolError(ErrorCode.ROOM_NOT_FOUND, "Room not found")
            )
          );
        }

        const snapshot = await roomService.getRoomSnapshot(
          targetRoomId,
          socket.data.user.id
        );
        ack?.(commandResultSuccess(requestId, snapshot));
      } catch (err: any) {
        ack?.(
          commandResultError(
            requestId,
            createProtocolError(ErrorCode.ROOM_NOT_FOUND, "Room not found")
          )
        );
      }
    }
  );

  // room:list-mine
  socket.on(
    ClientCommand.ROOM_LIST_MINE,
    async (
      envelope: CommandEnvelope<void>,
      ack?: (res: any) => void
    ) => {
      const requestId = envelope?.requestId || "list-mine";
      try {
        const rooms = await roomService.listOwnerRooms(socket.data.user.id);
        ack?.(commandResultSuccess(requestId, rooms));
      } catch (err: any) {
        ack?.(
          commandResultError(
            requestId,
            createProtocolError(ErrorCode.INTERNAL_ERROR, "Failed to list rooms")
          )
        );
      }
    }
  );

  // room:close
  socket.on(
    ClientCommand.ROOM_CLOSE,
    async (
      envelope: CommandEnvelope<CloseRoomPayload>,
      ack?: (res: any) => void
    ) => {
      const requestId = envelope?.requestId || "close-room";
      try {
        const parsed = closeRoomPayloadSchema.safeParse(envelope.payload);
        if (!parsed.success) {
          return ack?.(
            commandResultError(
              requestId,
              createProtocolError(ErrorCode.INVALID_PAYLOAD, "Invalid close payload")
            )
          );
        }

        const closedRoom = await roomService.closeRoom(
          socket.data.user.id,
          parsed.data.roomId
        );

        io.to(`room:${closedRoom.id}`).emit(ServerEvent.ROOM_CLOSED, {
          roomId: closedRoom.id,
        });

        ack?.(commandResultSuccess(requestId, { closed: true }));
      } catch (err: any) {
        let code: ErrorCode = ErrorCode.INTERNAL_ERROR;
        if (err.message === "FORBIDDEN") code = ErrorCode.FORBIDDEN;
        else if (err.message === "ROOM_NOT_FOUND") code = ErrorCode.ROOM_NOT_FOUND;

        ack?.(commandResultError(requestId, createProtocolError(code, err.message)));
      }
    }
  );

  // Disconnect handler
  socket.on("disconnect", async () => {
    if (socket.data.activeRoomId) {
      const roomId = socket.data.activeRoomId;
      await roomService.leaveRoom(socket.data.user.id, roomId);
      io.to(`room:${roomId}`).emit(ServerEvent.ROOM_PARTICIPANT_LEFT, {
        roomId,
        userId: socket.data.user.id,
      });
    }
  });
}
