import type { Socket, Server } from "socket.io";
import {
  ClientCommand,
  ServerEvent,
  createRoomPayloadSchema,
  joinRoomPayloadSchema,
  getRoomPayloadSchema,
  leaveRoomPayloadSchema,
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
import { toProtocolError } from "../errors.js";

export function registerRoomHandlers(
  io: Server,
  socket: Socket<any, any, any, AuthenticatedSocketData>,
  roomService: RoomService
) {
  /** True when another live socket of the same user is still in the room (multi-tab). */
  async function hasOtherSocketInRoom(roomId: string): Promise<boolean> {
    const sockets = await io.in(`room:${roomId}`).fetchSockets();
    return sockets.some(
      (s) => s.id !== socket.id && s.data?.user?.id === socket.data.user.id
    );
  }

  async function leaveAndNotify(roomId: string): Promise<void> {
    if (await hasOtherSocketInRoom(roomId)) return;
    await roomService.leaveRoom(socket.data.user.id, roomId);
    io.to(`room:${roomId}`).emit(ServerEvent.ROOM_PARTICIPANT_LEFT, {
      roomId,
      userId: socket.data.user.id,
    });
  }

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
      } catch (err) {
        ack?.(commandResultError(requestId, toProtocolError(err, "room:create")));
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
      } catch (err) {
        ack?.(commandResultError(requestId, toProtocolError(err, "room")));
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
      try {
        const parsed = leaveRoomPayloadSchema.safeParse(envelope?.payload);
        const roomId = parsed.success ? parsed.data.roomId : socket.data.activeRoomId;
        if (roomId && (await roomService.isMember(socket.data.user.id, roomId))) {
          socket.leave(`room:${roomId}`);
          if (socket.data.activeRoomId === roomId) socket.data.activeRoomId = undefined;
          await leaveAndNotify(roomId);
        }
        ack?.(commandResultSuccess(requestId, { left: true }));
      } catch (err) {
        ack?.(commandResultError(requestId, toProtocolError(err, "room:leave")));
      }
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
        const parsed = getRoomPayloadSchema.safeParse(envelope?.payload);
        if (!parsed.success) {
          return ack?.(
            commandResultError(
              requestId,
              createProtocolError(ErrorCode.INVALID_PAYLOAD, "Invalid get payload")
            )
          );
        }

        const roomId =
          parsed.data.roomId ??
          (parsed.data.globalId ? await roomService.resolveRoomId(parsed.data.globalId) : null);
        const userId = socket.data.user.id;

        // Snapshots expose participants and playback: members only.
        // Unknown and foreign rooms are indistinguishable to avoid leaking existence.
        if (!roomId || !(await roomService.isMember(userId, roomId))) {
          return ack?.(
            commandResultError(
              requestId,
              createProtocolError(ErrorCode.ROOM_NOT_FOUND, "ROOM_NOT_FOUND")
            )
          );
        }

        const snapshot = await roomService.getRoomSnapshot(roomId, userId);
        ack?.(commandResultSuccess(requestId, snapshot));
      } catch (err) {
        ack?.(commandResultError(requestId, toProtocolError(err, "room:get")));
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
      } catch (err) {
        ack?.(commandResultError(requestId, toProtocolError(err, "room:list-mine")));
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
        io.in(`room:${closedRoom.id}`).socketsLeave(`room:${closedRoom.id}`);

        ack?.(commandResultSuccess(requestId, { closed: true }));
      } catch (err) {
        ack?.(commandResultError(requestId, toProtocolError(err, "room")));
      }
    }
  );

  // Disconnect handler
  socket.on("disconnect", async () => {
    const roomId = socket.data.activeRoomId;
    if (!roomId) return;
    try {
      await leaveAndNotify(roomId);
    } catch (err) {
      console.error("[disconnect] failed to leave room:", err instanceof Error ? err.message : err);
    }
  });
}
