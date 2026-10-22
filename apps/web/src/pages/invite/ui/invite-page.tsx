import React, { useCallback, useEffect, useRef, useState } from "react";
import { LogIn, Settings } from "lucide-react";
import { useSession } from "../../../app/providers/session-context.js";
import { useI18n } from "../../../shared/lib/i18n/index.js";
import { Button } from "../../../shared/ui/button/button.js";
import { TextField } from "../../../shared/ui/text-field/text-field.js";
import { LangSwitch } from "../../../shared/ui/lang-switch/lang-switch.js";
import { SettingsModal } from "../../../widgets/settings-modal/index.js";
import { backend } from "../../../shared/api/backend.js";
import type { RoomSnapshotDto } from "@omioroom/contracts";
import styles from "./invite-page.module.scss";

interface InvitePageProps {
  globalId: string;
  initialCode: string | null;
  /** Returning users (identity already chosen) are joined without an extra click. */
  autoJoin: boolean;
  onJoined: (snapshot: RoomSnapshotDto) => void;
  onCancel: () => void;
}

export const InvitePage: React.FC<InvitePageProps> = ({
  globalId,
  initialCode,
  autoJoin,
  onJoined,
  onCancel,
}) => {
  const { connectionStatus, user, ensureUser, updateDisplayName } = useSession();
  const { t } = useI18n();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [code, setCode] = useState(initialCode ?? "");
  const [needsCode, setNeedsCode] = useState(false);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoTriedRef = useRef(false);

  const canRename = user?.kind !== "registered";

  const join = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      // A first-time guest gets an anonymous identity only now, when they actually join
      await ensureUser();
      if (canRename && name.trim() && name.trim() !== user?.displayName) {
        await updateDisplayName(name.trim());
      }
      onJoined(await backend.joinRoom(globalId, code.trim() || undefined));
    } catch (err: any) {
      const e = t.home.errors;
      if (err?.code === "PRIVATE_CODE_REQUIRED") {
        setNeedsCode(true);
        setError(e.privateCodeRequired);
      } else if (err?.code === "INVALID_PRIVATE_CODE") {
        setNeedsCode(true);
        setError(e.invalidPrivateCode);
      } else if (err?.code === "ROOM_FULL") {
        setError(e.roomFull);
      } else if (err?.code === "ROOM_NOT_FOUND") {
        setError(e.roomNotFound);
      } else if (err?.code === "RATE_LIMITED") {
        setError(t.invite.rateLimited);
      } else {
        setError(e.genericJoinError);
      }
    } finally {
      setLoading(false);
    }
  }, [globalId, code, name, user, canRename, ensureUser, updateDisplayName, onJoined, t]);

  useEffect(() => {
    if (!autoJoin || autoTriedRef.current || connectionStatus !== "connected" || !user) return;
    autoTriedRef.current = true;
    join();
  }, [autoJoin, connectionStatus, user, join]);

  return (
    <div className={styles.container} data-layout="invite-page">
      <div className={styles.topBar} data-layout="top-bar">
        <span />
        <div className={styles.topBarRight} data-layout="top-bar-right">
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

      <div className={styles.hero} data-layout="invite-hero">
        <div className={styles.kicker}>{t.invite.kicker}</div>
        <h1 className={styles.title}>
          {t.common.room} <span className={styles.roomId}>{globalId}</span>
        </h1>
      </div>

      <div className={styles.card} data-layout="invite-card">

        {user && (
          <div className={styles.asRow}>
            <span>{t.invite.joiningAs}</span>
            <strong>{user.displayName}</strong>
          </div>
        )}

        {canRename && (
          <TextField
            label={t.invite.nameLabel}
            placeholder={t.invite.namePlaceholder}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
          />
        )}

        {(needsCode || !initialCode) && (
          <TextField
            label={t.home.privateKeyLabel}
            placeholder={t.home.privateKeyPlaceholder}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            mono
          />
        )}

        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}

        <Button
          variant="primary"
          loading={loading}
          disabled={connectionStatus !== "connected"}
          onClick={join}
          icon={<LogIn size={16} />}
          className={styles.joinBtn}
        >
          {t.home.joinBtn}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {t.invite.toHome}
        </Button>
      </div>
    </div>
  );
};
