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
  USER_NOT_FOUND: "USER_NOT_FOUND",
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
