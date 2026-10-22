import React, { useEffect, useState, useCallback } from "react";
import { ArrowLeft, Play, Trash2, Users, Copy, Check, Lock, Globe, Settings } from "lucide-react";
import { useI18n } from "../../../shared/lib/i18n/index.js";
import { Button } from "../../../shared/ui/button/button.js";
import { Skeleton } from "../../../shared/ui/skeleton/skeleton.js";
import { Pill } from "../../../shared/ui/pill/pill.js";
import { FriendsPanel } from "../../../widgets/friends-panel/ui/friends-panel.js";
import { LangSwitch } from "../../../shared/ui/lang-switch/lang-switch.js";
import { SettingsModal } from "../../../widgets/settings-modal/index.js";
import { backend } from "../../../shared/api/backend.js";
import type { RoomSummaryDto, RoomSnapshotDto } from "@omioroom/contracts";
import styles from "./my-rooms-page.module.scss";

interface MyRoomsPageProps {
  onBack: () => void;
  onOpenRoom: (snapshot: RoomSnapshotDto) => void;
  onNavigateIdentity: () => void;
}

export const MyRoomsPage: React.FC<MyRoomsPageProps> = ({
  onBack,
  onOpenRoom,
  onNavigateIdentity,
}) => {
  const { t } = useI18n();
  const [rooms, setRooms] = useState<RoomSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const fetchRooms = useCallback(async () => {
    try {
      setLoading(true);
      setRooms(await backend.listMyRooms());
    } catch (err) {
      console.error("Failed to load rooms:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  const handleOpen = async (globalId: string) => {
    try {
      onOpenRoom(await backend.joinRoom(globalId));
    } catch (err: any) {
      alert(`Could not open room: ${err?.message ?? err}`);
    }
  };

  const handleClose = async (roomId: string) => {
    if (!window.confirm(t.myRooms.closeConfirm)) {
      return;
    }
    try {
      // Uploaded chat images live in Storage and must be removed explicitly
      await backend.deleteRoomAttachments(roomId).catch(() => {});
      await backend.closeRoom(roomId);
      setRooms((prev) => prev.filter((r) => r.id !== roomId));
    } catch (err: any) {
      alert(`Failed to close room: ${err?.message ?? err}`);
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
        <div className={styles.headerRight}>
          <LangSwitch />
          <button
            type="button"
            className={styles.settingsTrigger}
            onClick={() => setIsSettingsOpen(true)}
            aria-label={t.settings.title}
          >
            <Settings size={15} />
            <span>{t.common.settings}</span>
          </button>
        </div>
      </div>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      <aside className={styles.sidebar}>
        <FriendsPanel onNavigateIdentity={onNavigateIdentity} />
      </aside>

      <div className={styles.content}>
      {loading ? (
        <div className={styles.roomList}>
          {[0, 1, 2].map((i) => (
            <div key={i} className={styles.roomCard}>
              <Skeleton width="55%" shape="text" height={18} />
              <Skeleton width="80%" shape="text" />
              <Skeleton width="100%" height={32} />
            </div>
          ))}
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
          {rooms.map((room, i) => (
            <div key={room.id} className={`${styles.roomCard} motion-rise`} style={{ "--i": i } as React.CSSProperties}>
              <div className={styles.roomHeader}>
                <span className={styles.roomTitle}>{room.title}</span>
                <div className={styles.metaRow}>
                  <Pill variant="accent">{t.common.room} {room.globalId}</Pill>
                  <Pill variant={room.visibility === "private" ? "accent" : "default"}>
                    {room.visibility === "private" ? <Lock size={10} className={styles.metaIcon} /> : <Globe size={10} className={styles.metaIcon} />}
                    {room.visibility === "private" ? t.common.private : t.common.public}
                  </Pill>
                  <Pill variant={room.participantCount >= room.maxParticipants ? "success" : "default"}>
                    <Users size={10} className={styles.metaIcon} />
                    {room.participantCount} / {room.maxParticipants}
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
    </div>
  );
};