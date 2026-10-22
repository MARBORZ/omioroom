import React, { useState } from "react";
import { UserCheck, Shield, KeyRound, Sparkles, LogIn, UserPlus } from "lucide-react";
import { useSession } from "../../../app/providers/session-context.js";
import { useI18n } from "../../../shared/lib/i18n/index.js";
import { Button } from "../../../shared/ui/button/button.js";
import { TextField } from "../../../shared/ui/text-field/text-field.js";
import { Pill } from "../../../shared/ui/pill/pill.js";
import { LangSwitch } from "../../../shared/ui/lang-switch/lang-switch.js";
import { StatusIndicator } from "../../../shared/ui/status-indicator/status-indicator.js";
import styles from "./identity-page.module.scss";

interface IdentityPageProps {
  onSelect: () => void;
}

export const IdentityPage: React.FC<IdentityPageProps> = ({ onSelect }) => {
  const { connectionStatus, ensureUser, updateDisplayName, register, login } = useSession();
  const { t } = useI18n();

  // Nickname option state
  const [nickname, setNickname] = useState("");
  const [nickLoading, setNickLoading] = useState(false);
  const [nickError, setNickError] = useState<string | null>(null);

  // Account option state
  const [accountTab, setAccountTab] = useState<"login" | "register">("register");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  // 1. Anonymous handler
  const handleChooseAnonymous = async () => {
    try {
      await ensureUser();
      localStorage.setItem("omioroom_identity_chosen", "true");
      onSelect();
    } catch {
      setNickError(t.onboarding.authFailed);
    }
  };

  // 2. Custom nickname handler
  const handleChooseNickname = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim()) return;
    setNickError(null);
    setNickLoading(true);

    try {
      await updateDisplayName(nickname.trim());
      localStorage.setItem("omioroom_identity_chosen", "true");
      onSelect();
    } catch (err: any) {
      setNickError(err.message || "Failed to set nickname");
    } finally {
      setNickLoading(false);
    }
  };

  // 3. Registered account handler
  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password || (accountTab === "register" && !username.trim())) return;
    setAccountError(null);
    setAccountLoading(true);

    try {
      if (accountTab === "register") {
        await register(username.trim(), email.trim(), password);
      } else {
        await login(email.trim(), password);
      }
      localStorage.setItem("omioroom_identity_chosen", "true");
      onSelect();
    } catch (err: any) {
      if (err?.code === "INVALID_PAYLOAD") {
        setAccountError(t.onboarding.usernameTaken);
      } else if (err?.message === "CONFIRM_EMAIL") {
        setAccountError(t.onboarding.confirmEmail);
      } else if (err?.code === "UNAUTHENTICATED") {
        setAccountError(err.message || t.onboarding.authFailed);
      } else {
        setAccountError(t.onboarding.authFailed);
      }
    } finally {
      setAccountLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <div className={styles.brand}>
          <span className={styles.brandDot} />
          {t.common.brand}
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <StatusIndicator status={connectionStatus} />
          <LangSwitch />
        </div>
      </div>

      <div className={styles.hero}>
        <h1 className={styles.title}>{t.onboarding.welcome}</h1>
        <p className={styles.subtitle}>{t.onboarding.subtitle}</p>
      </div>

      <div className={styles.optionsList}>
        {/* OPTION 1: Anonymous in 1-Click */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitle}>
              <Shield size={16} color="var(--color-accent)" />
              {t.onboarding.anonTitle}
            </div>
            <Pill variant="default">GUEST</Pill>
          </div>
          <p className={styles.cardDesc}>{t.onboarding.anonDesc}</p>
          <Button
            variant="secondary"
            onClick={handleChooseAnonymous}
            icon={<Sparkles size={15} />}
          >
            {t.onboarding.anonBtn}
          </Button>
        </div>

        {/* OPTION 2: Temporary Nickname */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitle}>
              <UserCheck size={16} color="var(--color-accent)" />
              {t.onboarding.nickTitle}
            </div>
            <Pill variant="accent">NICKNAME</Pill>
          </div>
          <p className={styles.cardDesc}>{t.onboarding.nickDesc}</p>
          <form onSubmit={handleChooseNickname} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", gap: "8px" }}>
              <TextField
                placeholder={t.onboarding.nickPlaceholder}
                value={nickname}
                onChange={(e) => {
                  setNickname(e.target.value);
                  if (nickError) setNickError(null);
                }}
                disabled={nickLoading}
                style={{ flex: 1 }}
              />
              <Button
                type="submit"
                variant="primary"
                loading={nickLoading}
                disabled={!nickname.trim()}
              >
                {t.onboarding.nickBtn}
              </Button>
            </div>
            {nickError && <div className={styles.errorMessage}>{nickError}</div>}
          </form>
        </div>

        {/* OPTION 3: Full Account (Saved to DB) */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitle}>
              <KeyRound size={16} color="var(--color-accent)" />
              {t.onboarding.accountTitle}
            </div>
            <Pill variant="success">PERSISTENT</Pill>
          </div>
          <p className={styles.cardDesc}>{t.onboarding.accountDesc}</p>

          <div className={styles.tabRow}>
            <button
              type="button"
              className={`${styles.tabBtn} ${accountTab === "register" ? styles.activeTab : ""}`}
              onClick={() => {
                setAccountTab("register");
                setAccountError(null);
              }}
            >
              {t.onboarding.tabRegister}
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${accountTab === "login" ? styles.activeTab : ""}`}
              onClick={() => {
                setAccountTab("login");
                setAccountError(null);
              }}
            >
              {t.onboarding.tabLogin}
            </button>
          </div>

          <form onSubmit={handleAccountSubmit} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <TextField
              label={t.onboarding.emailLabel}
              type="email"
              placeholder="alex@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (accountError) setAccountError(null);
              }}
              disabled={accountLoading}
              required
            />
            {accountTab === "register" && (
              <TextField
                label={t.onboarding.usernameLabel}
                placeholder="alex_cinema"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (accountError) setAccountError(null);
                }}
                disabled={accountLoading}
                maxLength={30}
                required
              />
            )}
            <TextField
              label={t.onboarding.passwordLabel}
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (accountError) setAccountError(null);
              }}
              disabled={accountLoading}
              required
            />

            {accountError && <div className={styles.errorMessage}>{accountError}</div>}

            <Button
              type="submit"
              variant="primary"
              loading={accountLoading}
              disabled={!email.trim() || (accountTab === "register" && !username.trim()) || password.length < 6}
              icon={accountTab === "register" ? <UserPlus size={15} /> : <LogIn size={15} />}
            >
              {accountTab === "register" ? t.onboarding.registerBtn : t.onboarding.loginBtn}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};
