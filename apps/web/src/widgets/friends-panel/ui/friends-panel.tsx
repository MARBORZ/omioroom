import React, { useCallback, useEffect, useState } from "react";
import { UserPlus, UserMinus, Lock } from "lucide-react";
import {
  ClientCommand,
  getUserCapabilities,
  type FriendDto,
  type AddFriendPayload,
  type RemoveFriendPayload,
} from "@omioroom/contracts";
import { useSocketContext } from "../../../app/providers/socket-context.js";
import { useI18n } from "../../../shared/lib/i18n/index.js";
import { emitCommand } from "../../../shared/api/socket.js";
import { Button } from "../../../shared/ui/button/button.js";
import { TextField } from "../../../shared/ui/text-field/text-field.js";
import styles from "./friends-panel.module.scss";

interface FriendsPanelProps {
  onNavigateIdentity: () => void;
}

export const FriendsPanel: React.FC<FriendsPanelProps> = ({ onNavigateIdentity }) => {
  const { socket, user } = useSocketContext();
  const { t } = useI18n();
  const [friends, setFriends] = useState<FriendDto[]>([]);
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const allowed = user ? getUserCapabilities(user.kind).canManageFriends : false;

  const load = useCallback(async () => {
    try {
      setFriends(await emitCommand<{}, FriendDto[]>(socket, ClientCommand.FRIEND_LIST, {}));
    } catch {
      setError(t.friends.loadFailed);
    }
  }, [socket, t]);

  useEffect(() => {
    if (allowed) load();
  }, [allowed, load]);

  if (!user) return null;

  if (!allowed) {
    return (
      <section className={styles.panel} aria-label={t.friends.title}>
        <div className={styles.title}>
          <Lock size={12} /> {t.friends.title}
        </div>
        <p className={styles.hint}>{t.friends.registerOnly}</p>
        <Button variant="secondary" size="sm" onClick={onNavigateIdentity}>
          {t.friends.registerCta}
        </Button>
      </section>
    );
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const friend = await emitCommand<AddFriendPayload, FriendDto>(socket, ClientCommand.FRIEND_ADD, {
        username: username.trim(),
      });
      setFriends((prev) => [...prev.filter((f) => f.userId !== friend.userId), friend]);
      setUsername("");
    } catch (err: any) {
      setError(err?.code === "USER_NOT_FOUND" ? t.friends.notFound : t.friends.addFailed);
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (userId: string) => {
    try {
      await emitCommand<RemoveFriendPayload, { removed: boolean }>(socket, ClientCommand.FRIEND_REMOVE, { userId });
      setFriends((prev) => prev.filter((f) => f.userId !== userId));
    } catch {
      setError(t.friends.addFailed);
    }
  };

  return (
    <section className={styles.panel} aria-label={t.friends.title}>
      <div className={styles.title}>{t.friends.title}</div>
      <form onSubmit={handleAdd} className={styles.addRow}>
        <TextField
          label={t.friends.addLabel}
          placeholder={t.friends.addPlaceholder}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          error={error || undefined}
          style={{ flex: 1 }}
        />
        <Button type="submit" variant="primary" loading={busy} disabled={!username.trim()} icon={<UserPlus size={16} />}>
          {t.friends.add}
        </Button>
      </form>
      {friends.length === 0 ? (
        <p className={styles.hint}>{t.friends.empty}</p>
      ) : (
        <ul className={styles.list}>
          {friends.map((f) => (
            <li key={f.userId} className={styles.item}>
              <span>{f.displayName}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRemove(f.userId)}
                icon={<UserMinus size={14} />}
                aria-label={`${t.friends.remove} ${f.displayName}`}
              >
                {t.friends.remove}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
