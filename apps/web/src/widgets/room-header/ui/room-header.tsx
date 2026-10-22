import React, { useState } from "react";
import { Users, Tv, LogOut, Settings } from "lucide-react";
import { LangSwitch } from "../../../shared/ui/lang-switch/lang-switch.js";
import { SettingsModal } from "../../../widgets/settings-modal/index.js";
import { useI18n } from "../../../shared/lib/i18n/index.js";
import styles from "./room-header.module.scss";

interface RoomHeaderProps {
  participantCount?: number;
  maxParticipants?: number;
  onNavigateHome?: () => void;
  onNavigateMyRooms?: () => void;
  onLeave?: () => void;
  title?: string;
}

export const RoomHeader: React.FC<RoomHeaderProps> = ({
  participantCount = 1,
  maxParticipants = 2,
  onNavigateHome,
  onNavigateMyRooms,
  onLeave,
  title,
}) => {
  const { t } = useI18n();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <>
      <header className={styles.header}>
        <div className={styles.leftSection}>
          <button type="button" className={styles.brand} onClick={onNavigateHome}>
            <span className={styles.brandDot} />
            {t.common.brand}
          </button>
          {title && <span className={styles.roomTitle}>{title}</span>}
        </div>

        <div className={styles.rightSection}>
          <span className={styles.people} title={`${participantCount} / ${maxParticipants}`}>
            <Users size={14} />
            {participantCount} / {maxParticipants}
          </span>
          <LangSwitch />
          <button
            type="button"
            className={styles.link}
            onClick={() => setIsSettingsOpen(true)}
            aria-label={t.settings.title}
          >
            <Settings size={14} />
            <span>{t.common.settings}</span>
          </button>
          {onNavigateMyRooms && (
            <button type="button" className={styles.link} onClick={onNavigateMyRooms}>
              <Tv size={14} />
              {t.common.myRooms}
            </button>
          )}
          {onLeave && (
            <button type="button" className={styles.link} onClick={onLeave}>
              <LogOut size={14} />
              {t.room.leaveRoom}
            </button>
          )}
        </div>
      </header>
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </>
  );
};
