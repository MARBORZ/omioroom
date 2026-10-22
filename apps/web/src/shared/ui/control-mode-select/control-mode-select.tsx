import React from "react";
import { ControlMode } from "@omioroom/contracts";
import { useI18n } from "../../lib/i18n/index.js";
import styles from "./control-mode-select.module.scss";

interface ControlModeSelectProps {
  value: ControlMode;
  onChange: (mode: ControlMode) => void;
}

/** Who may control playback: everyone, the owner plus picked members, or the owner only. */
export const ControlModeSelect: React.FC<ControlModeSelectProps> = ({ value, onChange }) => {
  const { t } = useI18n();
  return (
    <label className={styles.field}>
      <span>{t.group.modeLabel}</span>
      <select className={styles.select} value={value} onChange={(e) => onChange(e.target.value as ControlMode)}>
        <option value={ControlMode.EVERYONE}>{t.group.modeEveryone}</option>
        <option value={ControlMode.SELECTED}>{t.group.modeSelected}</option>
        <option value={ControlMode.OWNER}>{t.group.modeOwner}</option>
      </select>
    </label>
  );
};
