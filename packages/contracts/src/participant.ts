import { z } from "zod";
import { displayNameSchema } from "./user.js";

export const MAX_ROOM_PARTICIPANTS = 2;

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
  joinedAt: z.string().datetime(),
  isOnline: z.boolean(),
});

export type ParticipantDto = z.infer<typeof participantDtoSchema>;

export const roomParticipantsSnapshotDtoSchema = z.object({
  roomId: z.string().uuid(),
  participants: z.array(participantDtoSchema),
});

export type RoomParticipantsSnapshotDto = z.infer<typeof roomParticipantsSnapshotDtoSchema>;
