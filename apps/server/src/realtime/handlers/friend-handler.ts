import type { Socket } from "socket.io";
import {
  ClientCommand,
  addFriendPayloadSchema,
  removeFriendPayloadSchema,
  commandResultSuccess,
  commandResultError,
  createProtocolError,
  ErrorCode,
  type CommandEnvelope,
} from "@omioroom/contracts";
import type { AuthenticatedSocketData } from "../middleware/auth-middleware.js";
import type { FriendService } from "../../application/friend-service.js";
import { toProtocolError } from "../errors.js";

export function registerFriendHandlers(
  socket: Socket<any, any, any, AuthenticatedSocketData>,
  friendService: FriendService
) {
  const invalid = (requestId: string) =>
    commandResultError(requestId, createProtocolError(ErrorCode.INVALID_PAYLOAD, "Invalid payload"));

  socket.on(ClientCommand.FRIEND_LIST, async (envelope: CommandEnvelope<unknown>, ack?: (r: any) => void) => {
    const requestId = envelope?.requestId || "friend-list";
    try {
      ack?.(commandResultSuccess(requestId, await friendService.list(socket.data.user)));
    } catch (err) {
      ack?.(commandResultError(requestId, toProtocolError(err, "friend:list")));
    }
  });

  socket.on(ClientCommand.FRIEND_ADD, async (envelope: CommandEnvelope<unknown>, ack?: (r: any) => void) => {
    const requestId = envelope?.requestId || "friend-add";
    try {
      const parsed = addFriendPayloadSchema.safeParse(envelope?.payload);
      if (!parsed.success) return ack?.(invalid(requestId));
      ack?.(commandResultSuccess(requestId, await friendService.add(socket.data.user, parsed.data.username)));
    } catch (err) {
      ack?.(commandResultError(requestId, toProtocolError(err, "friend:add")));
    }
  });

  socket.on(ClientCommand.FRIEND_REMOVE, async (envelope: CommandEnvelope<unknown>, ack?: (r: any) => void) => {
    const requestId = envelope?.requestId || "friend-remove";
    try {
      const parsed = removeFriendPayloadSchema.safeParse(envelope?.payload);
      if (!parsed.success) return ack?.(invalid(requestId));
      await friendService.remove(socket.data.user, parsed.data.userId);
      ack?.(commandResultSuccess(requestId, { removed: true }));
    } catch (err) {
      ack?.(commandResultError(requestId, toProtocolError(err, "friend:remove")));
    }
  });
}
