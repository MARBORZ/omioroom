import React, { useEffect, useState, useCallback } from "react";
import { ArrowLeft, Play, Trash2, Users, Copy, Check, Lock, Globe } from "lucide-react";
import { useSocketContext } from "../../../app/providers/socket-context.js";
import { useI18n } from "../../../shared/lib/i18n/index.js";
import { Button } from "../../../shared/ui/button/button.js";
import { Pill } from "../../../shared/ui/pill/pill.js";
import { LangSwitch } from "../../../shared/ui/lang-switch/lang-switch.js";
import { emitCommand } from "../../../shared/api/socket.js";
import {
  ClientCommand,
  type RoomSummaryDto,
  type RoomSnapshotDto,
  type JoinRoomPayload,
  type CloseRoomPayload,
} from "@omioroom/contracts";
import styles from "./my-rooms-page.module.scss";

interface MyRoomsPageProps {
  onBack: () => void;
  onOpenRoom: (snapshot: RoomSnapshotDto) => void;
}

export const MyRoomsPage: React.FC<MyRoomsPageProps> = ({
  onBack,
  onOpenRoom,
}) => {
  const { socket } = useSocketContext();
  const { t } = useI18n();
  const [rooms, setRooms] = useState<RoomSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchRooms = useCallback(async () => {
    try {
      setLoading(true);
      const list = await emitCommand<void, RoomSummaryDto[]>(
        socket,
        ClientCommand.ROOM_LIST_MINE,
        undefined as any
      );
      setRooms(list);
    } catch (err) {
      console.error("Failed to load rooms:", err);
    } finally {
      setLoading(false);
    }
  }, [socket]);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  const handleOpen = async (globalId: string) => {
    try {
      const snapshot = await emitCommand<JoinRoomPayload, RoomSnapshotDto>(
        socket,
        ClientCommand.ROOM_JOIN,
        { globalId }
      );
      onOpenRoom(snapshot);
    } catch (err: any) {
      alert(`Could not open room: ${err.message}`);
    }
  };

  const handleClose = async (roomId: string) => {
    if (!window.confirm(t.myRooms.closeConfirm)) {
      return;
    }
    try {
      await emitCommand<CloseRoomPayload, { closed: boolean }>(
        socket,
        ClientCommand.ROOM_CLOSE,
        { roomId }
      );
      setRooms((prev) => prev.filter((r) => r.id !== roomId));
    } catch (err: any) {
      alert(`Failed to close room: ${err.message}`);
    }
  };

  const handleCopyLink = (globalId: string) => {
    const url = `${window.location.origin}/#room=${globalId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(globalId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerRow}>
        <Button variant="ghost" size="sm" onClick={onBack} icon={<ArrowLeft size={16} />}>
          {t.common.back}
        </Button>
        <h1 className={styles.pageTitle}>{t.myRooms.title}</h1>
        <LangSwitch />
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--color-text-muted)" }}>
          {t.common.loading}
        </div>
      ) : rooms.length === 0 ? (
        <div className={styles.emptyState}>
          <p>{t.myRooms.empty}</p>
          <Button variant="primary" size="sm" onClick={onBack}>
            {t.myRooms.createOne}
          </Button>
        </div>
      ) : (
        <div className={styles.roomList}>
          {rooms.map((room) => (
            <div key={room.id} className={styles.roomCard}>
              <div className={styles.roomHeader}>
                <span className={styles.roomTitle}>{room.title}</span>
                <div className={styles.metaRow}>
                  <Pill variant="accent">{t.common.room} {room.globalId}</Pill>
                  <Pill variant={room.visibility === "private" ? "accent" : "default"}>
                    {room.visibility === "private" ? <Lock size={10} style={{ marginRight: 2 }} /> : <Globe size={10} style={{ marginRight: 2 }} />}
                    {room.visibility === "private" ? t.common.private : t.common.public}
                  </Pill>
                  <Pill variant={room.participantCount >= 2 ? "success" : "default"}>
                    <Users size={10} style={{ marginRight: 2 }} />
                    {room.participantCount} / 2
                  </Pill>
                </div>
              </div>

              <div className={styles.actionsRow}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopyLink(room.globalId)}
                  icon={copiedId === room.globalId ? <Check size={14} /> : <Copy size={14} />}
                >
                  {copiedId === room.globalId ? t.common.copied : t.common.copyLink}
                </Button>

                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => handleClose(room.id)}
                  icon={<Trash2 size={14} />}
                >
                  {t.common.close}
                </Button>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleOpen(room.globalId)}
                  icon={<Play size={14} />}
                >
                  {t.myRooms.enterRoom}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
