import React, { useEffect, useState } from "react";
import { Crown, Settings, Ban, UserX, MicOff } from "lucide-react";
import {
  MIN_ROOM_PARTICIPANTS,
  MAX_ROOM_PARTICIPANTS,
  type ControlMode,
  type ParticipantDto,
} from "@omioroom/contracts";
import { useI18n } from "../../../shared/lib/i18n/index.js";
import { Button } from "../../../shared/ui/button/button.js";
import { ControlModeSelect } from "../../../shared/ui/control-mode-select/control-mode-select.js";
import { ConfirmDialog } from "../../../shared/ui/confirm-dialog/confirm-dialog.js";
import styles from "./participants-panel.module.scss";

interface BannedUserDto {
  userId: string;
  displayName: string;
}

interface ParticipantsPanelProps {
  participants: ParticipantDto[];
  currentUserId: string | undefined;
  isOwner: boolean;
  canControl?: boolean;
  mutedUserIds?: string[];
  maxParticipants: number;
  controlMode: ControlMode;
  bannedUsers?: BannedUserDto[];
  onSaveSettings: (maxParticipants: number, controlMode: ControlMode) => Promise<void>;
  onToggleControl: (userId: string, canControl: boolean) => Promise<void>;
  onToggleMute?: (userId: string, muted: boolean) => Promise<void>;
  onKickMember?: (userId: string) => Promise<void>;
  onBanMember?: (userId: string) => Promise<void>;
  onUnbanMember?: (userId: string) => Promise<void>;
}

export const ParticipantsPanel: React.FC<ParticipantsPanelProps> = ({
  participants,
  currentUserId,
  isOwner,
  canControl = false,
  mutedUserIds = [],
  maxParticipants,
  controlMode,
  bannedUsers = [],
  onSaveSettings,
  onToggleControl,
  onToggleMute,
  onKickMember,
  onBanMember,
  onUnbanMember,
}) => {
  const { t } = useI18n();
  const [limit, setLimit] = useState(String(maxParticipants));
  const [mode, setMode] = useState<ControlMode>(controlMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    type: "kick" | "ban";
    userId: string;
    displayName: string;
  } | null>(null);

  // Follow changes made elsewhere (another tab, realtime)
  useEffect(() => setLimit(String(maxParticipants)), [maxParticipants]);
  useEffect(() => setMode(controlMode), [controlMode]);

  const online = participants.filter((p) => p.isOnline).length;
  const limitNumber = Number(limit);
  const limitValid =
    Number.isInteger(limitNumber) && limitNumber >= MIN_ROOM_PARTICIPANTS && limitNumber <= MAX_ROOM_PARTICIPANTS;
  const dirty = limitNumber !== maxParticipants || mode !== controlMode;

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      await onSaveSettings(limitNumber, mode);
    } catch {
      setError(t.group.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    const { type, userId } = confirmAction;
    setConfirmAction(null);
    try {
      if (type === "kick") {
        await onKickMember?.(userId);
      } else {
        await onBanMember?.(userId);
      }
    } catch {}
  };

  return (
    <section className={styles.panel} aria-label={t.group.participants}>
      <div className={styles.title}>
        <span>{t.group.participants}</span>
        <span className={styles.count}>
          {online} / {maxParticipants}
        </span>
      </div>

      <ul className={styles.list}>
        {participants.map((p, i) => {
          const isCurrentUser = p.userId === currentUserId;
          const isOrdinary = p.role !== "owner" && !p.canControl && !isCurrentUser;
          const canManage = isOwner || Boolean(canControl);
          const isMuted = Boolean(mutedUserIds.includes(p.userId));

          return (
            <li
              key={p.userId}
              className={`${styles.item} ${!p.isOnline ? styles.offlineItem : ""} motion-rise`}
              style={{ "--i": Math.min(i, 7) } as React.CSSProperties}
            >
              <span className={styles.who}>
                <span
                  className={`${styles.dot} ${p.isOnline ? styles.online : ""}`}
                  role="img"
                  aria-label={p.isOnline ? t.group.online : t.group.offline}
                />
                <span className={styles.name}>
                  {p.displayName}
                  {isCurrentUser ? ` (${t.group.you})` : ""}
                </span>
                {p.role === "owner" && <Crown size={12} aria-label={t.group.owner} />}
                {isMuted && (
                  <span className={styles.mutedBadge} title={t.group.mutedBadge} aria-label={t.group.mutedBadge}>
                    <MicOff size={12} />
                  </span>
                )}
              </span>

              <div className={styles.actions}>
                {isOwner && controlMode === "selected" && p.role === "member" && (
                  <label className={styles.control}>
                    <input
                      type="checkbox"
                      checked={p.canControl}
                      onChange={(e) => void onToggleControl(p.userId, e.target.checked)}
                    />
                    {t.group.canControl}
                  </label>
                )}

                {canManage && isOrdinary && (
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${isMuted ? styles.mutedActiveBtn : ""}`}
                    onClick={() => void onToggleMute?.(p.userId, !isMuted)}
                    title={isMuted ? t.group.unmuteMember : t.group.muteMember}
                    aria-label={isMuted ? t.group.unmuteMember : t.group.muteMember}
                  >
                    <MicOff size={12} />
                  </button>
                )}

                {isOwner && !isCurrentUser && p.role !== "owner" && (
                  <>
                    <button
                      type="button"
                      className={styles.actionBtn}
                      onClick={() =>
                        setConfirmAction({
                          type: "kick",
                          userId: p.userId,
                          displayName: p.displayName,
                        })
                      }
                      title={t.group.kick}
                      aria-label={t.group.kick}
                    >
                      <UserX size={12} />
                    </button>
                    <button
                      type="button"
                      className={`${styles.actionBtn} ${styles.dangerBtn}`}
                      onClick={() =>
                        setConfirmAction({
                          type: "ban",
                          userId: p.userId,
                          displayName: p.displayName,
                        })
                      }
                      title={t.group.ban}
                      aria-label={t.group.ban}
                    >
                      <Ban size={12} />
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {isOwner && bannedUsers.length > 0 && (
        <div className={styles.bannedSection}>
          <div className={styles.bannedTitle}>
            <Ban size={12} /> {t.group.bannedTitle} ({bannedUsers.length})
          </div>
          <ul className={styles.bannedList}>
            {bannedUsers.map((b) => (
              <li key={b.userId} className={styles.bannedItem}>
                <div className={styles.bannedInfo}>
                  <span className={styles.bannedName}>{b.displayName}</span>
                  <span className={styles.bannedSubtitle}>{t.group.bannedAllRooms}</span>
                </div>
                <button
                  type="button"
                  className={styles.unbanBtn}
                  onClick={() => onUnbanMember?.(b.userId)}
                >
                  {t.group.unban}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isOwner && (
        <div className={styles.settings}>
          <div className={styles.settingsTitle}>
            <Settings size={12} /> {t.group.settings}
          </div>
          <label className={styles.field}>
            <span>{t.group.maxLabel}</span>
            <input
              className={styles.input}
              type="number"
              min={MIN_ROOM_PARTICIPANTS}
              max={MAX_ROOM_PARTICIPANTS}
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
          </label>
          <ControlModeSelect value={mode} onChange={setMode} />
          {error && (
            <div className={styles.error} role="alert">
              {error}
            </div>
          )}
          <Button variant="secondary" size="sm" onClick={handleSave} loading={saving} disabled={!dirty || !limitValid}>
            {t.group.save}
          </Button>
        </div>
      )}

      {confirmAction && (
        <ConfirmDialog
          isOpen={true}
          title={
            confirmAction.type === "kick"
              ? t.group.kickConfirm(confirmAction.displayName)
              : t.group.banConfirm(confirmAction.displayName)
          }
          message={confirmAction.type === "ban" ? t.group.banHint : ""}
          confirmLabel={confirmAction.type === "kick" ? t.group.kick : t.group.ban}
          cancelLabel={t.common.close}
          onConfirm={handleConfirmAction}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </section>
  );
};
