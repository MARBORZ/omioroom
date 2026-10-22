import React, { useState } from "react";
import { Copy, Check, RotateCw, Lock, Globe } from "lucide-react";
import { useI18n } from "../../../shared/lib/i18n/index.js";
import { Button } from "../../../shared/ui/button/button.js";
import { Pill } from "../../../shared/ui/pill/pill.js";
import styles from "./invite-panel.module.scss";

interface InvitePanelProps {
  globalRoomId: string;
  isOwner: boolean;
  visibility: "public" | "private";
  privateCode?: string | null;
  onRotateCode?: () => Promise<void>;
  onToggleVisibility?: (newVis: "public" | "private") => Promise<void>;
}

export const InvitePanel: React.FC<InvitePanelProps> = ({
  globalRoomId,
  isOwner,
  visibility,
  privateCode,
  onRotateCode,
  onToggleVisibility,
}) => {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [toggling, setToggling] = useState(false);

  const getInviteUrl = () => {
    const origin = window.location.origin;
    if (visibility === "private" && privateCode) {
      return `${origin}/#room=${globalRoomId}&code=${privateCode}`;
    }
    return `${origin}/#room=${globalRoomId}`;
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getInviteUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      setCopied(false);
    }
  };

  const handleRotate = async () => {
    if (!onRotateCode) return;
    if (!window.confirm(t.room.rotateConfirm)) {
      return;
    }
    try {
      setRotating(true);
      await onRotateCode();
    } finally {
      setRotating(false);
    }
  };

  const handleToggle = async () => {
    if (!onToggleVisibility) return;
    const nextVis = visibility === "public" ? "private" : "public";
    try {
      setToggling(true);
      await onToggleVisibility(nextVis);
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className={styles.invitePanel}>
      <div className={styles.sectionTitle}>
        <span>{t.room.inviteTitle}</span>
        <Pill variant={visibility === "private" ? "accent" : "default"}>
          {visibility === "private" ? <Lock size={10} style={{ marginRight: 2 }} /> : <Globe size={10} style={{ marginRight: 2 }} />}
          {visibility === "private" ? t.common.private : t.common.public}
        </Pill>
      </div>

      <div className={styles.copyRow}>
        <Button
          variant="primary"
          onClick={handleCopy}
          icon={copied ? <Check size={16} /> : <Copy size={16} />}
          style={{ width: "100%" }}
        >
          {copied ? t.room.inviteCopied : t.room.copyInviteBtn}
        </Button>
      </div>

      {isOwner && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
          {visibility === "private" && privateCode && (
            <>
              <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
                {t.room.privateKeyNotice}
              </div>
              <div className={styles.privateCodeBox}>
                <span>{privateCode}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRotate}
                  loading={rotating}
                  icon={<RotateCw size={14} />}
                  title={t.room.rotateKey}
                >
                  {t.room.rotateKey}
                </Button>
              </div>
            </>
          )}

          <div className={styles.actionRow}>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleToggle}
              loading={toggling}
              style={{ width: "100%", fontSize: "12px" }}
            >
              {visibility === "public" ? t.room.switchToPrivate : t.room.switchToPublic}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
