import { z } from "zod";
import { roomVisibilitySchema } from "./access.js";
import {
  participantDtoSchema,
  MIN_ROOM_PARTICIPANTS,
  MAX_ROOM_PARTICIPANTS,
  DEFAULT_ROOM_PARTICIPANTS,
} from "./participant.js";
import { roomPlaybackStateDtoSchema } from "./playback.js";

export const globalRoomIdSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Global Room ID must be exactly 6 digits");

export const roomTitleSchema = z
  .string()
  .trim()
  .min(1, "Room title must not be empty")
  .max(60, "Room title must be at most 60 characters");

export const RoomStatus = {
  ACTIVE: "active",
  CLOSED: "closed",
} as const;

export type RoomStatus = (typeof RoomStatus)[keyof typeof RoomStatus];

export const roomStatusSchema = z.nativeEnum(RoomStatus);

export const ControlMode = {
  EVERYONE: "everyone",
  SELECTED: "selected",
  OWNER: "owner",
} as const;

export type ControlMode = (typeof ControlMode)[keyof typeof ControlMode];

export const controlModeSchema = z.nativeEnum(ControlMode);

export const maxParticipantsSchema = z
  .number()
  .int()
  .min(MIN_ROOM_PARTICIPANTS)
  .max(MAX_ROOM_PARTICIPANTS);

export const roomSummaryDtoSchema = z.object({
  id: z.string().uuid(),
  globalId: globalRoomIdSchema,
  ownerUserId: z.string().uuid(),
  title: roomTitleSchema,
  visibility: roomVisibilitySchema,
  status: roomStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  participantCount: z.number().int().min(0).max(MAX_ROOM_PARTICIPANTS),
  maxParticipants: maxParticipantsSchema,
  controlMode: controlModeSchema,
  revision: z.number().int().nonnegative(),
  /** When an empty room will delete itself; null while someone is inside. */
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
});

export type RoomSummaryDto = z.infer<typeof roomSummaryDtoSchema>;

export const roomSnapshotDtoSchema = z.object({
  room: roomSummaryDtoSchema,
  isOwner: z.boolean(),
  /** The viewer's own permission to control playback. */
  canControl: z.boolean(),
  participants: z.array(participantDtoSchema),
  /** Chat messages from others that the viewer has not seen yet. */
  unreadCount: z.number().int().nonnegative().default(0),
  /** Participants muted by the owner or a controller: no chat, silenced microphone. */
  mutedUserIds: z.array(z.string().uuid()).default([]),
  /** Banned users; filled for the owner only. */
  bannedUsers: z.array(z.object({ userId: z.string().uuid(), displayName: z.string() })).default([]),
  playback: roomPlaybackStateDtoSchema.nullable(),
});

export type RoomSnapshotDto = z.infer<typeof roomSnapshotDtoSchema>;

export const createRoomPayloadSchema = z.object({
  title: roomTitleSchema.optional().default("Watch Room"),
  visibility: roomVisibilitySchema.default("private"),
  maxParticipants: maxParticipantsSchema.default(DEFAULT_ROOM_PARTICIPANTS),
  controlMode: controlModeSchema.default("everyone"),
});

export type CreateRoomPayload = z.infer<typeof createRoomPayloadSchema>;

export const joinRoomPayloadSchema = z.object({
  globalId: globalRoomIdSchema,
  privateCode: z.string().trim().optional(),
});

export type JoinRoomPayload = z.infer<typeof joinRoomPayloadSchema>;

export const leaveRoomPayloadSchema = z.object({
  roomId: z.string().uuid(),
});

export type LeaveRoomPayload = z.infer<typeof leaveRoomPayloadSchema>;

export const getRoomPayloadSchema = z.object({
  roomId: z.string().uuid().optional(),
  globalId: globalRoomIdSchema.optional(),
}).refine((data) => data.roomId !== undefined || data.globalId !== undefined, {
  message: "Either roomId or globalId must be provided",
});

export type GetRoomPayload = z.infer<typeof getRoomPayloadSchema>;

export const closeRoomPayloadSchema = z.object({
  roomId: z.string().uuid(),
});

export type CloseRoomPayload = z.infer<typeof closeRoomPayloadSchema>;

export const updateRoomSettingsPayloadSchema = z.object({
  roomId: z.string().uuid(),
  maxParticipants: maxParticipantsSchema,
  controlMode: controlModeSchema,
});

export type UpdateRoomSettingsPayload = z.infer<typeof updateRoomSettingsPayloadSchema>;
