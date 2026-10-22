import { z } from "zod";
import type { ProtocolError } from "./errors.js";
import { roomSnapshotDtoSchema, type RoomSnapshotDto } from "./room.js";
import { roomOwnerAccessDtoSchema, type RoomOwnerAccessDto } from "./access.js";

export const PROTOCOL_VERSION = 1 as const;

export const commandEnvelopeSchema = <T extends z.ZodTypeAny>(payloadSchema: T) =>
  z.object({
    requestId: z.string().uuid(),
    protocolVersion: z.literal(PROTOCOL_VERSION),
    payload: payloadSchema,
  });

export interface CommandEnvelope<TPayload> {
  requestId: string;
  protocolVersion: typeof PROTOCOL_VERSION;
  payload: TPayload;
}

export type CommandResult<TData> =
  | {
      ok: true;
      requestId: string;
      data: TData;
    }
  | {
      ok: false;
      requestId: string;
      error: ProtocolError;
    };

export function commandResultSuccess<TData>(requestId: string, data: TData): CommandResult<TData> {
  return { ok: true, requestId, data };
}

export function commandResultError(requestId: string, error: ProtocolError): CommandResult<never> {
  return { ok: false, requestId, error };
}

export const ClientCommand = {
  SESSION_ME: "session:me",
  USER_UPDATE_DISPLAY_NAME: "user:update-display-name",
  ROOM_CREATE: "room:create",
  ROOM_JOIN: "room:join",
  ROOM_LEAVE: "room:leave",
  ROOM_GET: "room:get",
  ROOM_LIST_MINE: "room:list-mine",
  ROOM_SET_VISIBILITY: "room:set-visibility",
  ROOM_ROTATE_PRIVATE_CODE: "room:rotate-private-code",
  ROOM_REVOKE_PRIVATE_CODE: "room:revoke-private-code",
  ROOM_CLOSE: "room:close",
  PLAYER_COMMAND: "player:command",
  PLAYER_SYNC_REQUEST: "player:sync-request",
  TIME_PING: "time:ping",
} as const;

export type ClientCommand = (typeof ClientCommand)[keyof typeof ClientCommand];

export const ServerEvent = {
  ROOM_UPDATED: "room:updated",
  ROOM_CLOSED: "room:closed",
  ROOM_SNAPSHOT: "room:snapshot",
  ROOM_ACCESS_UPDATED: "room:access:updated",
  ROOM_PARTICIPANT_JOINED: "room:participant-joined",
  ROOM_PARTICIPANT_LEFT: "room:participant-left",
  ROOM_PARTICIPANTS_SNAPSHOT: "room:participants:snapshot",
  PLAYER_STATE: "player:state",
  PLAYER_SYNC_SNAPSHOT: "player:sync-snapshot",
  SERVER_ERROR: "server:error",
  CONNECTION_READY: "connection:ready",
  CONNECTION_RESUMED: "connection:resumed",
  TIME_PONG: "time:pong",
} as const;

export type ServerEvent = (typeof ServerEvent)[keyof typeof ServerEvent];

// Time sync
export const timePingPayloadSchema = z.object({
  clientSendTime: z.number().int().positive(),
});

export type TimePingPayload = z.infer<typeof timePingPayloadSchema>;

export const timePongPayloadSchema = z.object({
  clientSendTime: z.number().int().positive(),
  serverReceiveTime: z.number().int().positive(),
  serverSendTime: z.number().int().positive(),
});

export type TimePongPayload = z.infer<typeof timePongPayloadSchema>;

// Room create result returns full snapshot plus owner access if private
export const roomCreateResultSchema = z.object({
  snapshot: roomSnapshotDtoSchema,
  ownerAccess: roomOwnerAccessDtoSchema.nullable(),
});

export type RoomCreateResult = {
  snapshot: RoomSnapshotDto;
  ownerAccess: RoomOwnerAccessDto | null;
};

// Player sync request payload
export const playerSyncRequestPayloadSchema = z.object({
  roomId: z.string().uuid(),
});

export type PlayerSyncRequestPayload = z.infer<typeof playerSyncRequestPayloadSchema>;
