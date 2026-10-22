import type { ChatMessageDto, RoomPlaybackStateDto } from "@omioroom/contracts";
import { supabase } from "./supabase.js";
import { mapChatRow } from "./backend.js";

export type RoomChannelStatus = "connected" | "connecting" | "reconnecting" | "disconnected";

export interface RoomChannelHandlers {
  onPlayback: (state: RoomPlaybackStateDto) => void;
  onChat: (message: ChatMessageDto) => void;
  /** Visibility, closure or revision changes of the room row. */
  onRoomChanged: (row: { visibility: "public" | "private"; status: "active" | "closed"; revision: number }) => void;
  /** Someone new took a seat; refetch participants. */
  onMemberAdded: () => void;
  /** User ids currently present in the room channel. */
  onPresence: (userIds: string[]) => void;
  onStatus: (status: RoomChannelStatus) => void;
  /** Fired on every (re)subscription so the page can reload the authoritative snapshot. */
  onResync: () => void;
}

interface PlaybackRow {
  room_id: string;
  media: RoomPlaybackStateDto["media"];
  status: RoomPlaybackStateDto["status"];
  anchor_position: number;
  anchor_server_time: number | string;
  playback_rate: number;
  revision: number;
  updated_by: string | null;
}

export function mapPlaybackRow(row: PlaybackRow): RoomPlaybackStateDto {
  return {
    roomId: row.room_id,
    media: row.media,
    status: row.status,
    anchorPosition: row.anchor_position,
    anchorServerTime: Number(row.anchor_server_time),
    playbackRate: row.playback_rate,
    revision: row.revision,
    updatedByUserId: row.updated_by,
  };
}

/**
 * Subscribes to everything that changes in one room. Row changes are filtered by RLS on the
 * server, so only members receive them; presence only drives the "online" dots.
 */
export function openRoomChannel(roomId: string, userId: string, handlers: RoomChannelHandlers): () => void {
  const channel = supabase.channel(`room:${roomId}`, { config: { presence: { key: userId } } });

  channel
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "playback_state", filter: `room_id=eq.${roomId}` },
      (payload) => handlers.onPlayback(mapPlaybackRow(payload.new as PlaybackRow))
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "chat_messages", filter: `room_id=eq.${roomId}` },
      (payload) => handlers.onChat(mapChatRow(payload.new as Parameters<typeof mapChatRow>[0]))
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
      (payload) => handlers.onRoomChanged(payload.new as Parameters<RoomChannelHandlers["onRoomChanged"]>[0])
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "room_members", filter: `room_id=eq.${roomId}` },
      () => handlers.onMemberAdded()
    )
    .on("presence", { event: "sync" }, () => handlers.onPresence(Object.keys(channel.presenceState())))
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        handlers.onStatus("connected");
        void channel.track({ userId });
        handlers.onResync();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        handlers.onStatus("reconnecting");
      } else if (status === "CLOSED") {
        handlers.onStatus("disconnected");
      }
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}
