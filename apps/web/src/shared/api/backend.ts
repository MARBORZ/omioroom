import type {
  ControlMode,
  ChatMessageDto,
  FriendDto,
  MediaSourceInfo,
  PlayerCommandPayload,
  RoomCreateResult,
  RoomOwnerAccessDto,
  RoomPlaybackStateDto,
  RoomSnapshotDto,
  RoomSummaryDto,
  RoomVisibility,
  User,
} from "@omioroom/contracts";
import { rpc } from "./rpc.js";
import { prepareChatImage } from "../lib/image/prepare-chat-image.js";
import { supabase } from "./supabase.js";

const CHAT_BUCKET = "chat-attachments";

export function generateClientRequestId(): string {
  return crypto.randomUUID();
}

/** Typed facade over the database functions. One method per rule-bearing action. */
export const backend = {
  serverTimeMs: async (): Promise<number> => Number(await rpc<number | string>("server_time_ms")),

  usernameAvailable: (username: string) => rpc<boolean>("username_available", { p_username: username }),
  updateDisplayName: (name: string) =>
    rpc<{ id: string; kind: User["kind"]; displayName: string }>("update_display_name", { p_name: name }),

  createRoom: (
    visibility: RoomVisibility,
    options: { maxParticipants: number; controlMode: ControlMode },
    requestId = generateClientRequestId()
  ) =>
    rpc<RoomCreateResult>("create_room", {
      p_visibility: visibility,
      p_request_id: requestId,
      p_max_participants: options.maxParticipants,
      p_control_mode: options.controlMode,
    }),
  updateRoomSettings: (roomId: string, maxParticipants: number, controlMode: ControlMode) =>
    rpc<RoomSummaryDto>("update_room_settings", {
      p_room_id: roomId,
      p_max_participants: maxParticipants,
      p_control_mode: controlMode,
    }),
  setMemberControl: (roomId: string, userId: string, canControl: boolean) =>
    rpc<null>("set_member_control", { p_room_id: roomId, p_user_id: userId, p_can_control: canControl }),
  joinRoom: (globalId: string, privateCode?: string) =>
    rpc<RoomSnapshotDto>("join_room", { p_global_id: globalId, p_private_code: privateCode ?? null }),
  getSnapshot: (roomId: string) => rpc<RoomSnapshotDto>("get_room_snapshot", { p_room_id: roomId }),
  /**
   * Returns to a remembered room. Throws with code ROOM_NOT_FOUND / ROOM_CLOSED / NOT_MEMBER / BANNED when
   * the room is gone, closed, or the user is no longer in it.
   */
  resumeRoom: (roomId: string) => rpc<RoomSnapshotDto>("resume_room", { p_room_id: roomId }),
  /** Heartbeat that reports the state: "OK" | "ROOM_NOT_FOUND" | "ROOM_CLOSED" | "NOT_MEMBER" | "BANNED". */
  heartbeatRoom: (roomId: string) => rpc<string>("heartbeat_room", { p_room_id: roomId }),
  touchRoom: (roomId: string) => rpc<null>("touch_room", { p_room_id: roomId }),
  leaveRoom: (roomId: string) => rpc<null>("leave_room", { p_room_id: roomId }),
  kickMember: (roomId: string, userId: string) => rpc<null>("kick_member", { p_room_id: roomId, p_user_id: userId }),
  banMember: (roomId: string, userId: string) => rpc<null>("ban_member", { p_room_id: roomId, p_user_id: userId }),
  /** Owner or a controller mutes (or unmutes) an ordinary participant: no chat, silenced microphone. */
  setMemberMuted: (roomId: string, userId: string, muted: boolean) =>
    rpc<null>("set_member_muted", { p_room_id: roomId, p_user_id: userId, p_muted: muted }),
  /** The owner's blacklist: bans apply to all of their rooms. */
  listBannedUsers: () => rpc<Array<{ userId: string; displayName: string }>>("list_banned_users"),
  unbanUser: (userId: string) => rpc<null>("unban_user", { p_user_id: userId }),
  unbanMember: (roomId: string, userId: string) => rpc<null>("unban_member", { p_room_id: roomId, p_user_id: userId }),
  /** Marks chat as read up to this message; call debounced, only for the newest visible message. */
  markChatSeen: (roomId: string, messageId: string) =>
    rpc<null>("mark_chat_seen", { p_room_id: roomId, p_message_id: messageId }),
  listMyRooms: () => rpc<RoomSummaryDto[]>("list_my_rooms"),
  closeRoom: (roomId: string) => rpc<{ closed: boolean }>("close_room", { p_room_id: roomId }),

  setVisibility: (roomId: string, visibility: RoomVisibility, expectedRevision?: number) =>
    rpc<{ room: RoomSummaryDto; ownerAccess: RoomOwnerAccessDto | null }>("set_visibility", {
      p_room_id: roomId,
      p_visibility: visibility,
      p_expected_revision: expectedRevision ?? null,
    }),
  rotatePrivateCode: (roomId: string) => rpc<RoomOwnerAccessDto>("rotate_private_code", { p_room_id: roomId }),
  revokePrivateCode: (roomId: string) => rpc<{ revoked: boolean }>("revoke_private_code", { p_room_id: roomId }),

  playerCommand: (
    cmd: Omit<PlayerCommandPayload, "media"> & { media?: MediaSourceInfo | undefined }
  ) =>
    rpc<RoomPlaybackStateDto>("player_command", {
      p_room_id: cmd.roomId,
      p_command_id: cmd.commandId,
      p_type: cmd.type,
      p_position: cmd.position ?? null,
      p_media: cmd.media ?? null,
      p_playback_rate: cmd.playbackRate ?? null,
      p_expected_revision: cmd.expectedRevision ?? null,
    }),

  reportBuffering: (roomId: string, isBuffering: boolean, position?: number) =>
    rpc<RoomPlaybackStateDto>("report_buffering", {
      p_room_id: roomId,
      p_is_buffering: isBuffering,
      p_position: position ?? null,
    }),
  resolveBuffering: (roomId: string) => rpc<RoomPlaybackStateDto | null>("resolve_buffering", { p_room_id: roomId }),

  sendChat: (roomId: string, text: string, attachmentPath: string | null) =>
    rpc<ChatMessageDto>("send_chat", {
      p_room_id: roomId,
      p_text: text,
      p_attachment_path: attachmentPath,
    }),
  /** Uploads an image to the room's folder and returns its storage path. */
  uploadChatImage: async (roomId: string, file: File): Promise<string> => {
    const prepared = await prepareChatImage(file);
    const path = `${roomId}/${crypto.randomUUID()}.${prepared.extension}`;
    const { error } = await supabase.storage
      .from(CHAT_BUCKET)
      .upload(path, prepared.blob, { contentType: prepared.blob.type, upsert: false });
    if (error) throw error;
    return path;
  },
  signedImageUrl: async (path: string): Promise<string> => {
    const { data, error } = await supabase.storage.from(CHAT_BUCKET).createSignedUrl(path, 3600);
    if (error || !data) throw error ?? new Error("SIGNED_URL_FAILED");
    return data.signedUrl;
  },
  /** Owner cleanup when a room closes: Storage objects are not removed by deleting rows. */
  deleteRoomAttachments: async (roomId: string): Promise<void> => {
    const { data } = await supabase.storage.from(CHAT_BUCKET).list(roomId, { limit: 1000 });
    const paths = (data ?? []).map((o) => `${roomId}/${o.name}`);
    if (paths.length > 0) await supabase.storage.from(CHAT_BUCKET).remove(paths);
  },
  chatHistory: async (roomId: string): Promise<ChatMessageDto[]> => {
    const { data, error } = await supabase
      .from("chat_messages")
      .select("id, room_id, sender_id, sender_name, body, attachment_path, attachment_type, created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data ?? []).reverse().map(mapChatRow);
  },

  listFriends: () => rpc<FriendDto[]>("list_friends"),
  addFriend: (username: string) => rpc<FriendDto>("add_friend", { p_username: username }),
  removeFriend: (userId: string) => rpc<null>("remove_friend", { p_user_id: userId }),
};

interface ChatRow {
  id: string;
  room_id: string;
  sender_id: string;
  sender_name: string;
  body: string;
  attachment_path: string | null;
  attachment_type: "image" | null;
  created_at: string;
}

export function mapChatRow(row: ChatRow): ChatMessageDto {
  return {
    id: row.id,
    roomId: row.room_id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    text: row.body,
    attachmentPath: row.attachment_path,
    attachmentType: row.attachment_type,
    createdAt: row.created_at,
  };
}
