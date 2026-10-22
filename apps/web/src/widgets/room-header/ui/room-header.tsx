import React, { useState } from "react";
import { Users, LogOut, Settings } from "lucide-react";
import { SettingsModal } from "../../../widgets/settings-modal/index.js";
import { useI18n } from "../../../shared/lib/i18n/index.js";
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

  return (
    <>
      <header className={styles.header} data-layout="room-header">
        <div className={styles.leftSection}>
          <button type="button" className={styles.brand} onClick={onNavigateHome}>
            <span className={styles.brandDot} />
            {t.common.brand}
          </button>
          {roomNumber && (
            <button
              type="button"
              className={styles.roomTitle}
              title={t.common.copied}
              onClick={() => void navigator.clipboard?.writeText(roomNumber).catch(() => {})}
            >
              {t.room.roomNumber} {roomNumber}
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
              <Users size={14} />
              <span>{participantCount} / {maxParticipants}</span>
            </button>
          ) : (
            <span className={styles.people} title={`${participantCount} / ${maxParticipants}`}>
              <Users size={14} />
              <span>{participantCount} / {maxParticipants}</span>
            </span>
          )}

          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => setIsSettingsOpen(true)}
            aria-label={t.settings.title}
            title={t.common.settings}
          >
            <Settings size={15} />
          </button>

          {onLeave && (
            <button
              type="button"
              className={styles.leaveBtn}
              onClick={onLeave}
              aria-label={t.room.leaveRoom}
              title={t.room.leaveRoom}
            >
              <LogOut size={15} />
              <span className={styles.leaveText}>{t.room.leaveRoom}</span>
            </button>
          )}
        </div>
      </header>
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </>
  );
};
