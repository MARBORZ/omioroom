import {
  CHAT_HISTORY_LIMIT,
  type ChatMessageDto,
  type SendChatMessagePayload,
} from "@omioroom/contracts";
import type { Clock } from "../infrastructure/clock/system-clock.js";
import { generateId } from "../infrastructure/security/crypto.js";
import { RateLimiter } from "../infrastructure/security/rate-limiter.js";

/** In-memory room chat: last CHAT_HISTORY_LIMIT messages per room, dropped with the room. */
export class ChatService {
  private readonly messages = new Map<string, ChatMessageDto[]>();
  private readonly sendLimiter = new RateLimiter(10_000, 15);

  constructor(private readonly clock: Clock) {}

  send(
    sender: { id: string; displayName: string },
    payload: SendChatMessagePayload & { text: string }
  ): ChatMessageDto {
    if (!this.sendLimiter.checkAndRecord(sender.id)) {
      throw new Error("RATE_LIMITED");
    }

    const message: ChatMessageDto = {
      id: generateId(),
      roomId: payload.roomId,
      senderId: sender.id,
      senderName: sender.displayName,
      text: payload.text,
      attachmentUrl: payload.attachmentUrl ?? null,
      attachmentType: payload.attachmentUrl ? payload.attachmentType ?? "file" : null,
      createdAt: this.clock.isoNow(),
    };

    const list = this.messages.get(payload.roomId) ?? [];
    list.push(message);
    if (list.length > CHAT_HISTORY_LIMIT) {
      list.splice(0, list.length - CHAT_HISTORY_LIMIT);
    }
    this.messages.set(payload.roomId, list);
    return message;
  }

  history(roomId: string): ChatMessageDto[] {
    return [...(this.messages.get(roomId) ?? [])];
  }

  clear(roomId: string): void {
    this.messages.delete(roomId);
  }
}
