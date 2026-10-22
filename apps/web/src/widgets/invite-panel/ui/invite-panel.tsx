import React, { useState } from "react";
import { Copy, Check, RotateCw, Eye, EyeOff, Link2 } from "lucide-react";
import { useI18n } from "../../../shared/lib/i18n/index.js";
import { Button } from "../../../shared/ui/button/button.js";
import styles from "./invite-panel.module.scss";

interface InvitePanelProps {
  globalRoomId: string;
  isOwner: boolean;
  visibility: "public" | "private";
  privateCode?: string | null;
  codeRevoked?: boolean;
  onRevokeCode?: () => Promise<void>;
  onRotateCode?: () => Promise<void>;
  onToggleVisibility?: (newVis: "public" | "private") => Promise<void>;
}

type CopyTarget = "code" | "link" | "key";

export const InvitePanel: React.FC<InvitePanelProps> = ({
  globalRoomId,
  isOwner,
  visibility,
  privateCode,
  codeRevoked = false,
  onRevokeCode,
  onRotateCode,
  onToggleVisibility,
}) => {
  const { t } = useI18n();
  const [copied, setCopied] = useState<CopyTarget | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState<"rotate" | "revoke" | "toggle" | null>(null);

  const inviteUrl = () => {
    const base = `${window.location.origin}/#room=${globalRoomId}`;
    return visibility === "private" && privateCode ? `${base}&code=${privateCode}` : base;
  };

  const canCopyInvite = visibility === "public" || Boolean(privateCode);

  const copy = async (target: CopyTarget, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(target);
      setTimeout(() => setCopied((c) => (c === target ? null : c)), 1800);
    } catch {
      setCopied(null);
    }
  };

  const run = async (kind: "rotate" | "revoke" | "toggle", action?: () => Promise<void>, confirmText?: string) => {
    if (!action) return;
    if (confirmText && !window.confirm(confirmText)) return;
    try {
      setBusy(kind);
      await action();
      if (kind !== "toggle") setRevealed(false);
    } finally {
      setBusy(null);
    }
  };

  const copyIcon = (target: CopyTarget) => (copied === target ? <Check size={14} /> : <Copy size={14} />);

  return (
    <section className={styles.panel} aria-label={t.room.inviteTitle}>
      <div className={styles.title}>{t.room.inviteTitle}</div>

      <div className={styles.field}>
        <span className={styles.label}>{t.room.codeLabel}</span>
        <div className={styles.valueRow}>
          <span className={styles.value}>{globalRoomId}</span>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => void copy("code", globalRoomId)}
            aria-label={t.room.copyCode}
            title={copied === "code" ? t.room.codeCopied : t.room.copyCode}
          >
            {copyIcon("code")}
          </button>
        </div>
      </div>

      <Button
        variant="primary"
        onClick={() => void copy("link", inviteUrl())}
        disabled={!canCopyInvite}
        icon={copied === "link" ? <Check size={16} /> : <Link2 size={16} />}
      >
        {copied === "link" ? t.room.inviteCopied : t.room.copyInviteBtn}
      </Button>

      {isOwner && visibility === "private" && (
        <div className={styles.field}>
          <span className={styles.label}>{t.room.privateKeyNotice}</span>
          {privateCode ? (
            <div className={styles.valueRow}>
              <span className={styles.value} aria-live="polite">
                {revealed ? privateCode : "••••••••"}
              </span>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => setRevealed((v) => !v)}
                aria-label={revealed ? t.room.hideKey : t.room.showKey}
                aria-pressed={revealed}
              >
                {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => void copy("key", privateCode)}
                aria-label={t.room.copyKey}
                title={copied === "key" ? t.room.keyCopied : t.room.copyKey}
              >
                {copyIcon("key")}
              </button>
            </div>
          ) : (
            <p className={styles.hint}>{codeRevoked ? t.room.keyRevokedNotice : t.room.keyHiddenNotice}</p>
          )}

          <div className={styles.rowActions}>
            <Button
              variant="ghost"
              size="sm"
              loading={busy === "rotate"}
              icon={<RotateCw size={14} />}
              onClick={() => void run("rotate", onRotateCode, t.room.rotateConfirm)}
            >
              {t.room.rotateKey}
            </Button>
            {!codeRevoked && (
              <Button
                variant="danger"
                size="sm"
                loading={busy === "revoke"}
                onClick={() => void run("revoke", onRevokeCode, t.room.revokeConfirm)}
              >
                {t.room.revokeKey}
              </Button>
            )}
          </div>
        </div>
      )}

      {isOwner && (
        <Button
          variant="secondary"
          size="sm"
          loading={busy === "toggle"}
          onClick={() =>
            void run("toggle", () => onToggleVisibility?.(visibility === "public" ? "private" : "public") ?? Promise.resolve())
          }
        >
          {visibility === "public" ? t.room.switchToPrivate : t.room.switchToPublic}
        </Button>
      )}
    </section>
  );
};
