import { z } from "zod";

export const ErrorCode = {
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  ROOM_NOT_FOUND: "ROOM_NOT_FOUND",
  ROOM_CLOSED: "ROOM_CLOSED",
  ROOM_FULL: "ROOM_FULL",
  INVALID_PRIVATE_CODE: "INVALID_PRIVATE_CODE",
  PRIVATE_CODE_REQUIRED: "PRIVATE_CODE_REQUIRED",
  RATE_LIMITED: "RATE_LIMITED",
  INVALID_PAYLOAD: "INVALID_PAYLOAD",
  REVISION_CONFLICT: "REVISION_CONFLICT",
  DUPLICATE_REQUEST: "DUPLICATE_REQUEST",
  MEDIA_UNSUPPORTED: "MEDIA_UNSUPPORTED",
  MEDIA_ALREADY_LOADED: "MEDIA_ALREADY_LOADED",
  MEDIA_NOT_ALLOWED_IN_OPEN_ROOM: "MEDIA_NOT_ALLOWED_IN_OPEN_ROOM",
  MEDIA_COOLDOWN: "MEDIA_COOLDOWN",
  USER_NOT_FOUND: "USER_NOT_FOUND",
  ROOM_LIMIT: "ROOM_LIMIT",
  BANNED: "BANNED",
  MUTED: "MUTED",
  NOT_MEMBER: "NOT_MEMBER",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const errorCodeSchema = z.nativeEnum(ErrorCode);

export const protocolErrorSchema = z.object({
  code: errorCodeSchema,
  message: z.string().min(1),
  retryable: z.boolean(),
});

export type ProtocolError = z.infer<typeof protocolErrorSchema>;

export function createProtocolError(
  code: ErrorCode,
  message: string,
  retryable: boolean = false
): ProtocolError {
  return { code, message, retryable };
}
