import { z } from "zod";

export const UserKind = {
  ANONYMOUS: "anonymous",
  NICKNAME: "nickname",
  REGISTERED: "registered",
} as const;

export type UserKind = (typeof UserKind)[keyof typeof UserKind];

export const userKindSchema = z.nativeEnum(UserKind);

export const displayNameSchema = z
  .string()
  .trim()
  .min(2, "Display name must be at least 2 characters")
  .max(30, "Display name must be at most 30 characters")
  .regex(
    /^[\p{L}\p{N}\s._-]+$/u,
    "Display name can only contain letters, numbers, spaces, dots, hyphens, and underscores"
  );

export const userSchema = z.object({
  id: z.string().uuid(),
  kind: userKindSchema,
  displayName: displayNameSchema,
  normalizedName: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastSeenAt: z.string().datetime().nullable(),
});

export type User = z.infer<typeof userSchema>;

export const userSummaryDtoSchema = z.object({
  id: z.string().uuid(),
  displayName: displayNameSchema,
  kind: userKindSchema,
});

export type UserSummaryDto = z.infer<typeof userSummaryDtoSchema>;

export const updateDisplayNamePayloadSchema = z.object({
  displayName: displayNameSchema,
});

export type UpdateDisplayNamePayload = z.infer<typeof updateDisplayNamePayloadSchema>;

export const registerUserPayloadSchema = z.object({
  username: displayNameSchema,
  password: z.string().min(6, "Password must be at least 6 characters").max(64),
});

export type RegisterUserPayload = z.infer<typeof registerUserPayloadSchema>;

export const loginUserPayloadSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export type LoginUserPayload = z.infer<typeof loginUserPayloadSchema>;

export function normalizeDisplayName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}
