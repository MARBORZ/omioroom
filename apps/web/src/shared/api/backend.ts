import type {
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
  SendChatMessagePayload,
  User,
} from "@omioroom/contracts";
import { rpc } from "./rpc.js";
import { supabase } from "./supabase.js";

export function generateClientRequestId(): string {
  return crypto.randomUUID();
}

/** Typed facade over the database functions. One method per rule-bearing action. */
export const backend = {
  serverTimeMs: async (): Promise<number> => Number(await rpc<number | string>("server_time_ms")),

  usernameAvailable: (username: string) => rpc<boolean>("username_available", { p_username: username }),
  updateDisplayName: (name: string) =>
    rpc<{ id: string; kind: User["kind"]; displayName: string }>("update_display_name", { p_name: name }),

  createRoom: (title: string, visibility: RoomVisibility, requestId = generateClientRequestId()) =>
    rpc<RoomCreateResult>("create_room", { p_title: title, p_visibility: visibility, p_request_id: requestId }),
  joinRoom: (globalId: string, privateCode?: string) =>
    rpc<RoomSnapshotDto>("join_room", { p_global_id: globalId, p_private_code: privateCode ?? null }),
  getSnapshot: (roomId: string) => rpc<RoomSnapshotDto>("get_room_snapshot", { p_room_id: roomId }),
  touchRoom: (roomId: string) => rpc<null>("touch_room", { p_room_id: roomId }),
  leaveRoom: (roomId: string) => rpc<null>("leave_room", { p_room_id: roomId }),
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

  sendChat: (msg: SendChatMessagePayload) =>
    rpc<ChatMessageDto>("send_chat", {
      p_room_id: msg.roomId,
      p_text: msg.text ?? "",
      p_attachment_url: msg.attachmentUrl ?? null,
      p_attachment_type: msg.attachmentType ?? null,
    }),
  chatHistory: async (roomId: string): Promise<ChatMessageDto[]> => {
    const { data, error } = await supabase
      .from("chat_messages")
      .select("id, room_id, sender_id, sender_name, body, attachment_url, attachment_type, created_at")
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
  attachment_url: string | null;
  attachment_type: "image" | "file" | null;
  created_at: string;
}

export function mapChatRow(row: ChatRow): ChatMessageDto {
  return {
    id: row.id,
    roomId: row.room_id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    text: row.body,
    attachmentUrl: row.attachment_url,
    attachmentType: row.attachment_type,
    createdAt: row.created_at,
  };
}
