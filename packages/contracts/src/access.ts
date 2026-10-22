import { z } from "zod";

export const RoomVisibility = {
  PUBLIC: "public",
  PRIVATE: "private",
} as const;

export type RoomVisibility = (typeof RoomVisibility)[keyof typeof RoomVisibility];

export const roomVisibilitySchema = z.nativeEnum(RoomVisibility);

export const privateCodeSchema = z
  .string()
  .trim()
  .min(6, "Private code must be at least 6 characters")
  .max(32, "Private code must be at most 32 characters")
  .regex(/^[A-Za-z0-9_-]+$/, "Private code can only contain letters, numbers, hyphens, and underscores");

export const roomOwnerAccessDtoSchema = z.object({
  roomId: z.string().uuid(),
  privateCode: privateCodeSchema,
  rotatedAt: z.string().datetime(),
});

export type RoomOwnerAccessDto = z.infer<typeof roomOwnerAccessDtoSchema>;

export const setVisibilityPayloadSchema = z.object({
  roomId: z.string().uuid(),
  visibility: roomVisibilitySchema,
  expectedRevision: z.number().int().nonnegative().optional(),
});

export type SetVisibilityPayload = z.infer<typeof setVisibilityPayloadSchema>;

export const rotatePrivateCodePayloadSchema = z.object({
  roomId: z.string().uuid(),
});

export type RotatePrivateCodePayload = z.infer<typeof rotatePrivateCodePayloadSchema>;

export const revokePrivateCodePayloadSchema = z.object({
  roomId: z.string().uuid(),
});

export type RevokePrivateCodePayload = z.infer<typeof revokePrivateCodePayloadSchema>;
