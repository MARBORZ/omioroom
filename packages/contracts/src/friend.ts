import { z } from "zod";
import { displayNameSchema, UserKind, type UserKind as UserKindType } from "./user.js";

export interface UserCapabilities {
  /** Friends list is tied to a persistent account, so only registered users have it. */
  canManageFriends: boolean;
}

export function getUserCapabilities(kind: UserKindType): UserCapabilities {
  return { canManageFriends: kind === UserKind.REGISTERED };
}

export const friendDtoSchema = z.object({
  userId: z.string().uuid(),
  displayName: displayNameSchema,
});

export type FriendDto = z.infer<typeof friendDtoSchema>;

export const addFriendPayloadSchema = z.object({
  username: z.string().trim().min(1).max(30),
});

export type AddFriendPayload = z.infer<typeof addFriendPayloadSchema>;

export const removeFriendPayloadSchema = z.object({
  userId: z.string().uuid(),
});

export type RemoveFriendPayload = z.infer<typeof removeFriendPayloadSchema>;
