import React, { useState } from "react";
import { Plus, LogIn, Edit2, Check, Tv, Lock, Globe, UserCheck, Settings } from "lucide-react";
import { useSession } from "../../../app/providers/session-context.js";
import { useI18n } from "../../../shared/lib/i18n/index.js";
import { Button } from "../../../shared/ui/button/button.js";
import { TextField } from "../../../shared/ui/text-field/text-field.js";
import { ControlModeSelect } from "../../../shared/ui/control-mode-select/control-mode-select.js";
import { Skeleton } from "../../../shared/ui/skeleton/skeleton.js";
import { LangSwitch } from "../../../shared/ui/lang-switch/lang-switch.js";
import { SettingsModal } from "../../../widgets/settings-modal/index.js";
import { backend } from "../../../shared/api/backend.js";
import {
  DEFAULT_ROOM_PARTICIPANTS,
  MIN_ROOM_PARTICIPANTS,
  MAX_ROOM_PARTICIPANTS,
  type ControlMode,
  type RoomSnapshotDto,
} from "@omioroom/contracts";
import styles from "./home-page.module.scss";

interface HomePageProps {
  onRoomJoined: (snapshot: RoomSnapshotDto, ownerAccessKey?: string | null) => void;
  onNavigateMyRooms: () => void;
  onNavigateIdentity: () => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  onRoomJoined,
  onNavigateMyRooms,
  onNavigateIdentity,
}) => {
  const { connectionStatus, user, updateDisplayName } = useSession();
  const { t } = useI18n();

  // Nickname edit state
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [nameLoading, setNameLoading] = useState(false);

  // Settings modal
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Create room state
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [maxParticipants, setMaxParticipants] = useState(String(DEFAULT_ROOM_PARTICIPANTS));
  const [controlMode, setControlMode] = useState<ControlMode>("everyone");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Join room state
  const [joinCode, setJoinCode] = useState("");
  const [joinPrivateCode, setJoinPrivateCode] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const handleSaveName = async () => {
    if (!nameInput.trim()) return;
    try {
      setNameLoading(true);
      await updateDisplayName(nameInput.trim());
      setIsEditingName(false);
    } catch {
      // Ignored
    } finally {
      setNameLoading(false);
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreateLoading(true);

    try {
      const result = await backend.createRoom(visibility, {
        maxParticipants: Number(maxParticipants),
        controlMode,
      });

      onRoomJoined(result.snapshot, result.ownerAccess?.privateCode ?? null);
    } catch (err: any) {
      setCreateError(
        err?.code === "ROOM_LIMIT"
          ? t.home.errors.roomLimit
          : err?.code === "RATE_LIMITED"
          ? t.invite.rateLimited
          : t.home.errors.genericCreateError
      );
    } finally {
      setCreateLoading(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError(null);
    setJoinLoading(true);

    try {
      const snapshot = await backend.joinRoom(joinCode.trim(), joinPrivateCode.trim() || undefined);

      onRoomJoined(snapshot, joinPrivateCode.trim() || null);
    } catch (err: any) {
      if (err.code === "PRIVATE_CODE_REQUIRED") {
        setJoinError(t.home.errors.privateCodeRequired);
      } else if (err.code === "INVALID_PRIVATE_CODE") {
        setJoinError(t.home.errors.invalidPrivateCode);
      } else if (err.code === "ROOM_FULL") {
        setJoinError(t.home.errors.roomFull);
      } else if (err.code === "ROOM_NOT_FOUND") {
        setJoinError(t.home.errors.roomNotFound);
      } else {
        setJoinError(err.code === "RATE_LIMITED" ? t.invite.rateLimited : t.home.errors.genericJoinError);
      }
    } finally {
      setJoinLoading(false);
    }
  };

  return (
    <div className={styles.homeContainer} data-layout="home-page">
      {/* Top bar with language switch & settings */}
      <div className={styles.topBar} data-layout="top-bar">
        <div className={styles.brand}>
          <span className={styles.brandDot} />
          {t.common.brand}
        </div>
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

      <div className={styles.layout} data-layout="home-layout">
      <div className={styles.leftCol} data-layout="home-left">

      {/* Hero */}
      <div className={styles.hero} data-layout="home-hero">
        <h1 className={styles.headline}>{t.home.tagline}</h1>
      </div>

      {/* User Card */}
      <div className={styles.userCard} data-layout="user-card">
        {isEditingName ? (
          <div className={styles.editNameRow}>
            <TextField
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder={t.home.nicknamePlaceholder}
              disabled={nameLoading}
              autoFocus
            />
            <Button
              variant="primary"
              size="sm"
              onClick={handleSaveName}
              loading={nameLoading}
              icon={<Check size={14} />}
            >
              {t.common.save}
            </Button>
          </div>
        ) : (
          <>
            <div>
              <div className={styles.watchingAsLabel}>
                {t.home.watchingAs}
              </div>
              <div className={styles.displayName}>
                <Skeleton loading={!user} width={120} shape="text" height={16}>
                  {user?.displayName}
                </Skeleton>
              </div>
            </div>
            <div className={styles.userCardActions}>
              <Button
                variant="ghost"
                size="sm"
                icon={<Edit2 size={13} />}
                onClick={() => {
                  setNameInput(user?.displayName || "");
                  setIsEditingName(true);
                }}
              >
                {t.common.change}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={<UserCheck size={13} />}
                onClick={onNavigateIdentity}
              >
                {t.onboarding.switchMode}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<Tv size={13} />}
                onClick={onNavigateMyRooms}
              >
                {t.common.myRooms}
              </Button>
            </div>
          </>
        )}
      </div>

      </div>

      <div className={styles.rightCol} data-layout="home-right">
      {/* Create Room Card */}
      <div className={styles.card}>
        <div className={styles.cardTitle}>{t.home.createTitle}</div>
        <form onSubmit={handleCreateRoom} className={styles.cardForm}>
          <div className={styles.toggleRow}>
            <Button
              type="button"
              variant={visibility === "private" ? "primary" : "secondary"}
              size="sm"
              onClick={() => setVisibility("private")}
              icon={<Lock size={14} />}
              className={styles.toggleBtn}
            >
              {t.home.privateMode}
            </Button>
            <Button
              type="button"
              variant={visibility === "public" ? "primary" : "secondary"}
              size="sm"
              onClick={() => setVisibility("public")}
              icon={<Globe size={14} />}
              className={styles.toggleBtn}
            >
              {t.home.publicMode}
            </Button>
          </div>

          <p className={styles.hint}>{t.room.roomNameHint}</p>
          <TextField
            label={t.group.createLimit}
            type="number"
            min={MIN_ROOM_PARTICIPANTS}
            max={MAX_ROOM_PARTICIPANTS}
            value={maxParticipants}
            onChange={(e) => setMaxParticipants(e.target.value)}
          />
          <ControlModeSelect value={controlMode} onChange={setControlMode} />

          {createError && (
            <div className={styles.formError}>
              {createError}
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            loading={createLoading}
            disabled={
              connectionStatus !== "connected" ||
              !Number.isInteger(Number(maxParticipants)) ||
              Number(maxParticipants) < MIN_ROOM_PARTICIPANTS ||
              Number(maxParticipants) > MAX_ROOM_PARTICIPANTS
            }
            icon={<Plus size={16} />}
          >
            {t.home.createBtn}
          </Button>
        </form>
      </div>

      <div className={styles.divider}>{t.home.or}</div>

      {/* Join Room Card */}
      <div className={styles.card}>
        <div className={styles.cardTitle}>{t.home.joinTitle}</div>
        <form onSubmit={handleJoinRoom} className={styles.cardForm}>
          <TextField
            label={t.home.globalIdLabel}
            placeholder="482731"
            mono
            maxLength={6}
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, ""))}
            required
          />

          <TextField
            label={t.home.privateKeyLabel}
            placeholder={t.home.privateKeyPlaceholder}
            mono
            value={joinPrivateCode}
            onChange={(e) => setJoinPrivateCode(e.target.value)}
          />

          {joinError && (
            <div className={styles.formError}>
              {joinError}
            </div>
          )}

          <Button
            type="submit"
            variant="secondary"
            loading={joinLoading}
            disabled={connectionStatus !== "connected" || joinCode.length !== 6}
            icon={<LogIn size={16} />}
          >
            {t.home.joinBtn}
          </Button>
        </form>
      </div>
      </div>
      </div>
    </div>
  );
};