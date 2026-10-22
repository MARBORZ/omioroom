import React from "react";
import styles from "./status-indicator.module.scss";

export type ConnectionStatusType =
  | "connected"
  | "connecting"
  | "reconnecting"
  | "disconnected"
  | "buffering"
  | "error"
  | "in-sync";

interface StatusIndicatorProps {
  status: ConnectionStatusType;
  customLabel?: string;
  className?: string;
  style?: React.CSSProperties;
}

const DEFAULT_LABELS: Record<ConnectionStatusType, string> = {
  connected: "Connected",
  connecting: "Connecting",
  reconnecting: "Reconnecting",
  disconnected: "Disconnected",
  buffering: "Buffering",
  error: "Error",
  "in-sync": "In Sync",
};

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status,
  customLabel,
  className,
  style,
}) => {
  const label = customLabel || DEFAULT_LABELS[status];
  const statusClassKey = status === "in-sync" ? "inSync" : status;
  const statusClass = (styles as any)[statusClassKey] || "";

  return (
    <div
      className={`${styles.statusIndicator} ${className || ""}`}
      style={style}
      role="status"
      aria-label={`Status: ${label}`}
    >
      <span className={`${styles.dot} ${statusClass}`} aria-hidden="true" />
      <span className={`${styles.label} ${statusClass}`}>{label}</span>
    </div>
  );
};
