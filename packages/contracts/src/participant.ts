import { z } from "zod";
import { displayNameSchema } from "./user.js";

/** Room size is chosen by the owner within these bounds. */
export const MIN_ROOM_PARTICIPANTS = 2;
export const MAX_ROOM_PARTICIPANTS = 32;
export const DEFAULT_ROOM_PARTICIPANTS = 8;

export const RoomRole = {
  OWNER: "owner",
  MEMBER: "member",
} as const;

export type RoomRole = (typeof RoomRole)[keyof typeof RoomRole];

export const roomRoleSchema = z.nativeEnum(RoomRole);

export const participantDtoSchema = z.object({
  userId: z.string().uuid(),
  displayName: displayNameSchema,
  role: roomRoleSchema,
  /** May play/pause/seek/change media under the room's control mode. */
  canControl: z.boolean(),
  joinedAt: z.string().datetime(),
  isOnline: z.boolean(),
  /** Time of the newest chat message this member has seen (read receipts); null before any. */
  chatSeenAt: z.string().datetime({ offset: true }).nullable().optional(),
});

export type ParticipantDto = z.infer<typeof participantDtoSchema>;

export const roomParticipantsSnapshotDtoSchema = z.object({
  roomId: z.string().uuid(),
  participants: z.array(participantDtoSchema),
});

export type RoomParticipantsSnapshotDto = z.infer<typeof roomParticipantsSnapshotDtoSchema>;
export const VOICE_MAX_PARTICIPANTS = 8;
