import React, { useEffect, useState } from "react";
import { Crown, Settings } from "lucide-react";
import {
  MIN_ROOM_PARTICIPANTS,
  MAX_ROOM_PARTICIPANTS,
  type ControlMode,
  type ParticipantDto,
} from "@omioroom/contracts";
import { useI18n } from "../../../shared/lib/i18n/index.js";
import { Button } from "../../../shared/ui/button/button.js";
import { ControlModeSelect } from "../../../shared/ui/control-mode-select/control-mode-select.js";
import styles from "./participants-panel.module.scss";

interface ParticipantsPanelProps {
  participants: ParticipantDto[];
  currentUserId: string | undefined;
  isOwner: boolean;
  maxParticipants: number;
  controlMode: ControlMode;
  onSaveSettings: (maxParticipants: number, controlMode: ControlMode) => Promise<void>;
  onToggleControl: (userId: string, canControl: boolean) => Promise<void>;
}

export const ParticipantsPanel: React.FC<ParticipantsPanelProps> = ({
  participants,
  currentUserId,
  isOwner,
  maxParticipants,
  controlMode,
  onSaveSettings,
  onToggleControl,
}) => {
  const { t } = useI18n();
  const [limit, setLimit] = useState(String(maxParticipants));
  const [mode, setMode] = useState<ControlMode>(controlMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <section className={styles.panel} aria-label={t.group.participants}>
      <div className={styles.title}>
        <span>{t.group.participants}</span>
        <span className={styles.count}>
          {online} / {maxParticipants}
        </span>
      </div>

      <ul className={styles.list}>
        {participants.map((p) => (
          <li key={p.userId} className={styles.item}>
            <span className={styles.who}>
              <span
                className={`${styles.dot} ${p.isOnline ? styles.online : ""}`}
                role="img"
                aria-label={p.isOnline ? t.group.online : t.group.offline}
              />
              <span className={styles.name}>
                {p.displayName}
                {p.userId === currentUserId ? ` (${t.group.you})` : ""}
              </span>
              {p.role === "owner" && <Crown size={12} aria-label={t.group.owner} />}
            </span>
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
          </li>
        ))}
      </ul>

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
    </section>
  );
};
