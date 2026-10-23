import React, { useState, useMemo } from "react";
import { UserCheck, Shield, KeyRound, Sparkles, LogIn, UserPlus, Settings, Eye, EyeOff } from "lucide-react";
import { checkPassword, passwordsMatch, displayNameSchema } from "@omioroom/contracts";
import { useSession } from "../../../app/providers/session-context.js";
import { useI18n } from "../../../shared/lib/i18n/index.js";
import { Button } from "../../../shared/ui/button/button.js";
import { TextField } from "../../../shared/ui/text-field/text-field.js";
import { SettingsModal } from "../../../widgets/settings-modal/index.js";
import { Logo } from "../../../shared/ui/logo/logo.js";
import styles from "./identity-page.module.scss";

type IdentityMode = "anon" | "nick" | "account";

interface IdentityPageProps {
  onSelect: () => void;
}

export const IdentityPage: React.FC<IdentityPageProps> = ({ onSelect }) => {
  const { ensureUser, updateDisplayName, register, login } = useSession();
  const { t } = useI18n();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // On phones and tablets the three options are states of one card, chosen with a switcher
  const [mode, setMode] = useState<IdentityMode>("anon");

  // Nickname option state
  const [nickname, setNickname] = useState("");
  const [nickLoading, setNickLoading] = useState(false);
  const [nickError, setNickError] = useState<string | null>(null);

  // Account option state
  const [accountTab, setAccountTab] = useState<"login" | "register">("register");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showRepeatPassword, setShowRepeatPassword] = useState(false);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  // Validate username using displayNameSchema from contracts
  const usernameParsed = useMemo(() => {
    if (!username.trim()) return null;
    return displayNameSchema.safeParse(username.trim());
  }, [username]);

  const usernameError = useMemo(() => {
    if (!username) return undefined;
    if (usernameParsed && !usernameParsed.success) {
      return t.onboarding.usernameInvalid;
    }
    return undefined;
  }, [username, usernameParsed, t.onboarding.usernameInvalid]);

  const isUsernameValid = Boolean(usernameParsed?.success);

  // Validate email format
  const isEmailValid = useMemo(() => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }, [email]);

  // Live checkPassword (pass username and email from form)
  const passwordCheck = useMemo(
    () => checkPassword(password, { username: username.trim(), email: email.trim() }),
    [password, username, email]
  );

  // Live passwordsMatch
  const isPasswordMatching = useMemo(
    () => passwordsMatch(password, repeatPassword),
    [password, repeatPassword]
  );

  const repeatMismatch = repeatPassword.length > 0 && !isPasswordMatching;

  const isRegister = accountTab === "register";
  const canSubmit = isRegister
    ? !accountLoading && isUsernameValid && isEmailValid && passwordCheck.ok && isPasswordMatching
    : !accountLoading && isEmailValid && password.length > 0;

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
    if (!canSubmit) return;
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
      const isUsernameTaken =
        err?.message?.includes("Username is already taken") ||
        err?.message?.includes("already taken") ||
        err?.code === "USERNAME_TAKEN";

      if (isUsernameTaken) {
        setAccountError(t.onboarding.usernameTaken);
      } else if (
        err?.code === "INVALID_PAYLOAD" ||
        (typeof err?.message === "string" && err.message.includes("INVALID_PAYLOAD"))
      ) {
        setAccountError(t.onboarding.invalidPayload);
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
    <div className={styles.container} data-layout="identity-page">
      <div className={styles.topBar} data-layout="top-bar">
        <div className={styles.brand}>
          <Logo size="sm" showText={true} />
        </div>
        <div className={styles.topBarRight} data-layout="top-bar-right">
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

      <div className={styles.hero} data-layout="identity-hero">
        <h1 className={styles.title}>{t.onboarding.welcome}</h1>
        <p className={styles.subtitle}>{t.onboarding.subtitle}</p>
      </div>

      <div className={styles.modeTabs} role="tablist" aria-label={t.onboarding.subtitle}>
        {(
          [
            ["anon", t.onboarding.modeAnon],
            ["nick", t.onboarding.modeName],
            ["account", t.onboarding.modeAccount],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`identity-tab-${id}`}
            aria-selected={mode === id}
            aria-controls={`identity-card-${id}`}
            className={`${styles.modeTab} ${mode === id ? styles.modeTabActive : ""}`}
            onClick={() => setMode(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={styles.optionsList} data-layout="identity-options">
        {/* OPTION 1: Anonymous in 1-Click */}
        <div
          className={styles.card}
          id="identity-card-anon"
          role="tabpanel"
          aria-labelledby="identity-tab-anon"
          data-active={mode === "anon"}
        >
          <div className={styles.cardHeader}>
            <div className={styles.cardTitle}>
              <Shield size={16} color="var(--color-accent)" />
              {t.onboarding.anonTitle}
            </div>
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
        <div
          className={styles.card}
          id="identity-card-nick"
          role="tabpanel"
          aria-labelledby="identity-tab-nick"
          data-active={mode === "nick"}
        >
          <div className={styles.cardHeader}>
            <div className={styles.cardTitle}>
              <UserCheck size={16} color="var(--color-accent)" />
              {t.onboarding.nickTitle}
            </div>
          </div>
          <p className={styles.cardDesc}>{t.onboarding.nickDesc}</p>
          <form onSubmit={handleChooseNickname} className={styles.nickForm}>
            <div className={styles.nickInputRow}>
              <TextField
                placeholder={t.onboarding.nickPlaceholder}
                value={nickname}
                onChange={(e) => {
                  setNickname(e.target.value);
                  if (nickError) setNickError(null);
                }}
                disabled={nickLoading}
                className={styles.nickField}
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
        <div
          className={styles.card}
          id="identity-card-account"
          role="tabpanel"
          aria-labelledby="identity-tab-account"
          data-active={mode === "account"}
        >
          <div className={styles.cardHeader}>
            <div className={styles.cardTitle}>
              <KeyRound size={16} color="var(--color-accent)" />
              {t.onboarding.accountTitle}
            </div>
          </div>
          <p className={styles.cardDesc}>{t.onboarding.accountDesc}</p>

          <div className={styles.tabRow}>
            <button
              type="button"
              className={`${styles.tabBtn} ${accountTab === "register" ? styles.activeTab : ""}`}
              onClick={() => {
                setAccountTab("register");
                setAccountError(null);
                setRepeatPassword("");
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
                setRepeatPassword("");
              }}
            >
              {t.onboarding.tabLogin}
            </button>
          </div>

          <form onSubmit={handleAccountSubmit} className={styles.accountForm}>
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
                error={usernameError}
                disabled={accountLoading}
                maxLength={30}
                required
              />
            )}
            <div className={styles.passwordWrapper}>
              <TextField
                label={t.onboarding.passwordLabel}
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (accountError) setAccountError(null);
                }}
                disabled={accountLoading}
                endAdornment={
                  <button
                    type="button"
                    className={styles.eyeBtn}
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? t.onboarding.hidePassword : t.onboarding.showPassword}
                    title={showPassword ? t.onboarding.hidePassword : t.onboarding.showPassword}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                }
                required
              />

              {accountTab === "register" && (
                <>
                  <div className={styles.strengthMeter} aria-hidden="true">
                    {[1, 2, 3, 4].map((segIndex) => (
                      <div
                        key={segIndex}
                        className={`${styles.strengthSegment} ${
                          password && passwordCheck.score >= segIndex
                            ? styles[`strengthScore${passwordCheck.score}`]
                            : ""
                        }`}
                      />
                    ))}
                  </div>

                  {password.length > 0 && passwordCheck.problems.length > 0 && (
                    <ul className={styles.problemList} aria-label="Password requirements">
                      {passwordCheck.problems.map((prob) => (
                        <li key={prob} className={styles.problemItem}>
                          {t.onboarding.passwordProblems[prob]}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>

            {accountTab === "register" && (
              <TextField
                label={t.onboarding.repeatPasswordLabel}
                type={showRepeatPassword ? "text" : "password"}
                placeholder="••••••••"
                value={repeatPassword}
                onChange={(e) => {
                  setRepeatPassword(e.target.value);
                  if (accountError) setAccountError(null);
                }}
                disabled={accountLoading}
                error={repeatMismatch ? t.onboarding.passwordsDoNotMatch : undefined}
                endAdornment={
                  <button
                    type="button"
                    className={styles.eyeBtn}
                    onClick={() => setShowRepeatPassword((v) => !v)}
                    aria-label={showRepeatPassword ? t.onboarding.hidePassword : t.onboarding.showPassword}
                    title={showRepeatPassword ? t.onboarding.hidePassword : t.onboarding.showPassword}
                    tabIndex={-1}
                  >
                    {showRepeatPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                }
                required
              />
            )}

            {accountError && <div className={styles.errorMessage}>{accountError}</div>}

            <Button
              type="submit"
              variant="primary"
              loading={accountLoading}
              disabled={!canSubmit}
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
