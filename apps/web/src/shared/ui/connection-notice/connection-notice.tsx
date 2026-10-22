import React, { useEffect, useState } from "react";
import type { ConnectionStatusType } from "../../model/connection.js";
import { useI18n } from "../../lib/i18n/index.js";
import styles from "./connection-notice.module.scss";

/** Says something only when the connection is actually a problem, and not for brief blips. */
export const ConnectionNotice: React.FC<{ status: ConnectionStatusType }> = ({ status }) => {
  const { t } = useI18n();
  const bad = status === "reconnecting" || status === "disconnected";
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!bad) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), 2500);
    return () => clearTimeout(timer);
  }, [bad]);

  if (!visible) return null;
  return (
    <div className={`${styles.notice} motion-pop`} role="status">
      {t.room.reconnecting}
    </div>
  );
};
