import type { Socket, Server } from "socket.io";
import {
  ClientCommand,
  ServerEvent,
  sendChatMessagePayloadSchema,
  chatHistoryPayloadSchema,
  commandResultSuccess,
  commandResultError,
  createProtocolError,
  ErrorCode,
  type CommandEnvelope,
} from "@omioroom/contracts";
import type { AuthenticatedSocketData } from "../middleware/auth-middleware.js";
import type { RoomService } from "../../application/room-service.js";
import type { ChatService } from "../../application/chat-service.js";
import { toProtocolError } from "../errors.js";

export function registerChatHandlers(
  io: Server,
  socket: Socket<any, any, any, AuthenticatedSocketData>,
  roomService: RoomService,
  chatService: ChatService
) {
  socket.on(
    ClientCommand.CHAT_SEND,
    async (envelope: CommandEnvelope<unknown>, ack?: (res: any) => void) => {
      const requestId = envelope?.requestId || "chat-send";
      try {
        const parsed = sendChatMessagePayloadSchema.safeParse(envelope?.payload);
        if (!parsed.success) {
          return ack?.(
            commandResultError(
              requestId,
              createProtocolError(
                ErrorCode.INVALID_PAYLOAD,
                parsed.error.errors[0]?.message || "Invalid chat message"
              )
            )
          );
        }

        const { user } = socket.data;
        await roomService.assertActiveMember(user.id, parsed.data.roomId);

        const message = chatService.send(user, parsed.data);
        io.to(`room:${parsed.data.roomId}`).emit(ServerEvent.CHAT_MESSAGE, message);
        ack?.(commandResultSuccess(requestId, message));
      } catch (err) {
        ack?.(commandResultError(requestId, toProtocolError(err, "chat:send")));
      }
    }
  );

  socket.on(
    ClientCommand.CHAT_HISTORY,
    async (envelope: CommandEnvelope<unknown>, ack?: (res: any) => void) => {
      const requestId = envelope?.requestId || "chat-history";
      try {
        const parsed = chatHistoryPayloadSchema.safeParse(envelope?.payload);
        if (!parsed.success) {
          return ack?.(
            commandResultError(
              requestId,
              createProtocolError(ErrorCode.INVALID_PAYLOAD, "Invalid chat history request")
            )
          );
        }
        await roomService.assertActiveMember(socket.data.user.id, parsed.data.roomId);
        ack?.(commandResultSuccess(requestId, chatService.history(parsed.data.roomId)));
      } catch (err) {
        ack?.(commandResultError(requestId, toProtocolError(err, "chat:history")));
      }
    }
  );
}
