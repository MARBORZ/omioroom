import React from "react";
import { Users, Tv } from "lucide-react";
import { Pill } from "../../../shared/ui/pill/pill.js";
import { StatusIndicator, type ConnectionStatusType } from "../../../shared/ui/status-indicator/status-indicator.js";
import styles from "./room-header.module.scss";

interface RoomHeaderProps {
  globalRoomId?: string;
  participantCount?: number;
  connectionStatus: ConnectionStatusType;
  onNavigateHome?: () => void;
  onNavigateMyRooms?: () => void;
  title?: string;
}

export const RoomHeader: React.FC<RoomHeaderProps> = ({
  globalRoomId,
  participantCount = 1,
  connectionStatus,
  onNavigateHome,
  onNavigateMyRooms,
  title,
}) => {
  return (
    <header className={styles.header}>
      <div className={styles.leftSection}>
        <div
          className={styles.brand}
          onClick={onNavigateHome}
          style={{ cursor: onNavigateHome ? "pointer" : "default" }}
          role={onNavigateHome ? "button" : undefined}
          tabIndex={onNavigateHome ? 0 : undefined}
        >
          <span className={styles.brandDot} />
          OMIOROOM
        </div>

        {globalRoomId && (
          <Pill variant="accent">
            ROOM {globalRoomId}
          </Pill>
        )}

        {title && (
          <span style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>
            {title}
          </span>
        )}
      </div>

      <div className={styles.rightSection}>
        <StatusIndicator status={connectionStatus} />

        {globalRoomId && (
          <Pill variant={participantCount >= 2 ? "success" : "default"}>
            <Users size={12} style={{ marginRight: 2 }} />
            {participantCount} / 2
          </Pill>
        )}

        {onNavigateMyRooms && (
          <button
            type="button"
            onClick={onNavigateMyRooms}
            style={{
              background: "none",
              border: "none",
              color: "var(--color-text-muted)",
              fontSize: "13px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <Tv size={14} />
            My Rooms
          </button>
        )}
      </div>
    </header>
  );
};
