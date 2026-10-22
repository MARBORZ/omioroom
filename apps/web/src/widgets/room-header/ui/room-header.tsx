import React, { useState } from "react";
import { Users, LogOut, Settings, Copy, Check } from "lucide-react";
import { SettingsModal } from "../../../widgets/settings-modal/index.js";
import { useI18n } from "../../../shared/lib/i18n/index.js";
import { Logo } from "../../../shared/ui/logo/logo.js";
import styles from "./room-header.module.scss";

interface RoomHeaderProps {
  participantCount?: number;
  maxParticipants?: number;
  onNavigateHome?: () => void;
  onNavigateMyRooms?: () => void;
  onLeave?: () => void;
  roomNumber?: string;
  onOpenParticipants?: () => void;
}

export const RoomHeader: React.FC<RoomHeaderProps> = ({
  participantCount = 1,
  maxParticipants = 2,
  onNavigateHome,
  onLeave,
  roomNumber,
  onOpenParticipants,
}) => {
  const { t } = useI18n();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyRoom = () => {
    if (!roomNumber) return;
    void navigator.clipboard?.writeText(roomNumber).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <>
      <header className={styles.header} data-layout="room-header">
        <div className={styles.leftSection}>
          <button type="button" className={styles.brand} onClick={onNavigateHome} title={t.common.brand}>
            <Logo size="sm" showText={true} />
          </button>
          {roomNumber && (
            <button
              type="button"
              className={`${styles.roomChip} ${copied ? styles.copiedChip : ""}`}
              onClick={handleCopyRoom}
              title={copied ? t.common.copied : t.common.copyLink}
              aria-label={`${t.room.roomNumber} ${roomNumber}`}
            >
              <span className={styles.roomPrefix}>{t.room.roomNumber}</span>
              <span className={styles.roomNum}>{roomNumber}</span>
              {copied ? (
                <span className={styles.copiedBadge}>
                  <Check size={12} className={styles.copyIcon} />
                  <span className={styles.copiedText}>{t.common.copied}</span>
                </span>
              ) : (
                <Copy size={12} className={styles.copyIcon} />
              )}
            </button>
          )}
        </div>

        <div className={styles.rightSection}>
          {onOpenParticipants ? (
            <button
              type="button"
              className={styles.peopleBtn}
              onClick={onOpenParticipants}
              title={`${t.group.participants}: ${participantCount} / ${maxParticipants}`}
              aria-label={t.group.participants}
            >
              <span className={styles.pulseDot} />
              <Users size={13} />
              <span>{participantCount}/{maxParticipants}</span>
            </button>
          ) : (
            <span className={styles.people} title={`${participantCount} / ${maxParticipants}`}>
              <span className={styles.pulseDot} />
              <Users size={13} />
              <span>{participantCount}/{maxParticipants}</span>
            </span>
          )}

          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => setIsSettingsOpen(true)}
            aria-label={t.settings.title}
            title={t.common.settings}
          >
            <Settings size={15} className={styles.gearIcon} />
          </button>

          {onLeave && (
            <button
              type="button"
              className={styles.leaveBtn}
              onClick={onLeave}
              aria-label={t.room.leaveRoom}
              title={t.room.leaveRoom}
            >
              <LogOut size={14} />
              <span className={styles.leaveText}>{t.room.leaveRoom}</span>
            </button>
          )}
        </div>
      </header>
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </>
  );
};
