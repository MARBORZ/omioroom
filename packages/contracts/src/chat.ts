import { z } from "zod";

export const CHAT_MAX_TEXT_LENGTH = 1000;
export const CHAT_HISTORY_LIMIT = 100;
/** What an admin who owns the room loads and keeps on screen: the server does not trim those rooms. */
export const CHAT_HISTORY_LIMIT_OWNER = 1000;

/** Chat attachments are images (and gifs) uploaded from the device; nothing else. */
export const CHAT_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"] as const;
export const CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
/** Photos larger than this (either side) are downscaled before upload. */
export const CHAT_IMAGE_MAX_DIMENSION = 1920;

export const AttachmentType = {
  IMAGE: "image",
} as const;

export type AttachmentType = (typeof AttachmentType)[keyof typeof AttachmentType];

export const attachmentTypeSchema = z.nativeEnum(AttachmentType);

export const chatMessageDtoSchema = z.object({
  id: z.string().uuid(),
  roomId: z.string().uuid(),
  senderId: z.string().uuid(),
  senderName: z.string(),
  text: z.string(),
  /** Storage path ("<roomId>/<file>"); shown through a signed URL. */
  attachmentPath: z.string().nullable(),
  attachmentType: attachmentTypeSchema.nullable(),
  createdAt: z.string().datetime(),
  /** Reactions map: emoji -> array of user UUIDs who reacted with that emoji */
  reactions: z.record(z.string(), z.array(z.string().uuid())).default({}),
});

export type ChatMessageDto = z.infer<typeof chatMessageDtoSchema>;
