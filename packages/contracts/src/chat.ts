import { z } from "zod";

export const CHAT_MAX_TEXT_LENGTH = 1000;
export const CHAT_HISTORY_LIMIT = 100;

export const AttachmentType = {
  IMAGE: "image",
  FILE: "file",
} as const;

export type AttachmentType = (typeof AttachmentType)[keyof typeof AttachmentType];

export const attachmentTypeSchema = z.nativeEnum(AttachmentType);

const httpUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .url()
  .refine((value) => /^https?:\/\//i.test(value), "Only http(s) attachment URLs are allowed");

export const chatMessageDtoSchema = z.object({
  id: z.string().uuid(),
  roomId: z.string().uuid(),
  senderId: z.string().uuid(),
  senderName: z.string(),
  text: z.string(),
  attachmentUrl: httpUrlSchema.nullable(),
  attachmentType: attachmentTypeSchema.nullable(),
  createdAt: z.string().datetime(),
});

export type ChatMessageDto = z.infer<typeof chatMessageDtoSchema>;

export const sendChatMessagePayloadSchema = z
  .object({
    roomId: z.string().uuid(),
    text: z.string().trim().max(CHAT_MAX_TEXT_LENGTH).default(""),
    attachmentUrl: httpUrlSchema.nullish(),
    attachmentType: attachmentTypeSchema.nullish(),
  })
  .refine((v) => v.text.length > 0 || Boolean(v.attachmentUrl), {
    message: "Message must contain text or an attachment",
  })
  .refine((v) => !v.attachmentUrl || Boolean(v.attachmentType), {
    message: "attachmentType is required with attachmentUrl",
  });

export type SendChatMessagePayload = z.input<typeof sendChatMessagePayloadSchema>;

export const chatHistoryPayloadSchema = z.object({
  roomId: z.string().uuid(),
});

export type ChatHistoryPayload = z.infer<typeof chatHistoryPayloadSchema>;
