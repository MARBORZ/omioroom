import React from "react";
import { useI18n } from "../../lib/i18n/index.js";
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

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status,
  customLabel,
  className,
  style,
}) => {
  let tStatus: any = null;
  try {
    const { t } = useI18n();
    tStatus = t.status;
  } catch {
    // Fallback if rendered outside provider
  }

  const defaultLabels: Record<ConnectionStatusType, string> = {
    connected: tStatus?.connected || "Connected",
    connecting: tStatus?.connecting || "Connecting",
    reconnecting: tStatus?.reconnecting || "Reconnecting",
    disconnected: tStatus?.disconnected || "Disconnected",
    buffering: tStatus?.buffering || "Buffering",
    error: tStatus?.error || "Error",
    "in-sync": tStatus?.inSync || "In Sync",
  };

  const label = customLabel || defaultLabels[status];
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
