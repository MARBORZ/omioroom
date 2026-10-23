import React, { useCallback, useEffect, useState } from "react";
import { Ban } from "lucide-react";
import { backend } from "../../../shared/api/backend.js";
import { useI18n } from "../../../shared/lib/i18n/index.js";
import { Button } from "../../../shared/ui/button/button.js";
import { Skeleton } from "../../../shared/ui/skeleton/skeleton.js";
import { ConfirmDialog } from "../../../shared/ui/confirm-dialog/confirm-dialog.js";
import styles from "./blacklist-panel.module.scss";

export interface BannedUserEntry {
  userId: string;
  displayName: string;
}

export interface BlacklistPanelProps {
  embedded?: boolean;
  className?: string;
}

export const BlacklistPanel: React.FC<BlacklistPanelProps> = ({ embedded = false, className = "" }) => {
  const { t } = useI18n();
  const [bannedUsers, setBannedUsers] = useState<BannedUserEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userToUnban, setUserToUnban] = useState<BannedUserEntry | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await backend.listBannedUsers();
      setBannedUsers(list ?? []);
    } catch {
      setError(t.blacklist.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleConfirmUnban = async () => {
    if (!userToUnban) return;
    const target = userToUnban;
    setUserToUnban(null);
    setBusyId(target.userId);

    // Optimistically remove from list immediately without reload
    setBannedUsers((prev) => prev.filter((u) => u.userId !== target.userId));

    try {
      await backend.unbanUser(target.userId);
    } catch {
      // Revert on error
      void load();
    } finally {
      setBusyId(null);
    }
  };

  const containerClass = `${embedded ? styles.embedded : styles.panel} ${className}`;

  return (
    <section className={containerClass} aria-label={t.blacklist.title}>
      <div className={styles.header}>
        <div className={styles.title}>
          <Ban size={13} />
          <span>{t.blacklist.title}</span>
        </div>
        {!loading && bannedUsers.length > 0 && (
          <span className={styles.count}>{bannedUsers.length}</span>
        )}
      </div>

      {loading ? (
        <div className={styles.skeletonList}>
          <Skeleton width="65%" shape="text" height={16} />
          <Skeleton width="45%" shape="text" height={16} />
        </div>
      ) : error ? (
        <p className={styles.empty}>{error}</p>
      ) : bannedUsers.length === 0 ? (
        <p className={styles.empty}>{t.blacklist.empty}</p>
      ) : (
        <ul className={styles.list}>
          {bannedUsers.map((u) => (
            <li key={u.userId} className={styles.item}>
              <div className={styles.userInfo}>
                <span className={styles.name}>{u.displayName}</span>
                <span className={styles.notice}>{t.blacklist.allRoomsNotice}</span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className={styles.unbanBtn}
                loading={busyId === u.userId}
                onClick={() => setUserToUnban(u)}
              >
                {t.blacklist.unban}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {userToUnban && (
        <ConfirmDialog
          isOpen={true}
          title={t.blacklist.unbanConfirm(userToUnban.displayName)}
          message={t.blacklist.unbanHint}
          confirmLabel={t.blacklist.unban}
          cancelLabel={t.common.close}
          onConfirm={handleConfirmUnban}
          onCancel={() => setUserToUnban(null)}
        />
      )}
    </section>
  );
};
