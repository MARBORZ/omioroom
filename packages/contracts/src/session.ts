import { z } from "zod";
import { userSchema, type User } from "./user.js";

export const OMIOROOM_SESSION_HEADER = "x-omioroom-session";
export const OMIOROOM_SESSION_COOKIE = "omioroom_session";

export const sessionSchema = z.object({
  id: z.string().min(16),
  userId: z.string().uuid(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable(),
});

export type Session = z.infer<typeof sessionSchema>;

export const sessionInfoDtoSchema = z.object({
  session: z.object({
    id: z.string().min(16),
    expiresAt: z.string().datetime(),
  }),
  user: userSchema,
});

export type SessionInfoDto = {
  session: {
    id: string;
    expiresAt: string;
  };
  user: User;
};

export const initSessionPayloadSchema = z.object({
  displayName: z.string().trim().min(2).max(30).optional(),
});

export type InitSessionPayload = z.infer<typeof initSessionPayloadSchema>;
