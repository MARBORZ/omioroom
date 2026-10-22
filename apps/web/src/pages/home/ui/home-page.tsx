import React, { useState } from "react";
import { Plus, LogIn, Edit2, Check, Tv, Lock, Globe, UserCheck } from "lucide-react";
import { useSession } from "../../../app/providers/session-context.js";
import { useI18n } from "../../../shared/lib/i18n/index.js";
import { Button } from "../../../shared/ui/button/button.js";
import { TextField } from "../../../shared/ui/text-field/text-field.js";
import { StatusIndicator } from "../../../shared/ui/status-indicator/status-indicator.js";
import { Pill } from "../../../shared/ui/pill/pill.js";
import { LangSwitch } from "../../../shared/ui/lang-switch/lang-switch.js";
import { backend } from "../../../shared/api/backend.js";
import type { RoomSnapshotDto } from "@omioroom/contracts";
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

  // Create room state
  const [roomTitle, setRoomTitle] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("private");
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
      const result = await backend.createRoom(roomTitle.trim() || "Watch Room", visibility);

      onRoomJoined(result.snapshot, result.ownerAccess?.privateCode ?? null);
    } catch (err: any) {
      setCreateError(err?.code === "RATE_LIMITED" ? t.invite.rateLimited : t.home.errors.genericCreateError);
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
    <div className={styles.homeContainer}>
      {/* Top bar with language switch */}
      <div className={styles.topBar}>
        <div className={styles.brand}>
          <span className={styles.brandDot} />
          {t.common.brand}
        </div>
        <div className={styles.topBarRight}>
          <StatusIndicator status={connectionStatus} />
          <LangSwitch />
        </div>
      </div>

      <div className={styles.layout}>
      <div className={styles.leftCol}>

      {/* Hero */}
      <div className={styles.hero}>
        <h1 className={styles.headline}>{t.home.tagline}</h1>
      </div>

      {/* User Card */}
      <div className={styles.userCard}>
        {isEditingName ? (
          <div style={{ display: "flex", gap: 8, width: "100%", alignItems: "center" }}>
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
              <div style={{ fontSize: "11px", color: "var(--color-text-muted)", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6 }}>
                {t.home.watchingAs}
                {user?.kind && (
                  <Pill variant={user.kind === "registered" ? "success" : user.kind === "nickname" ? "accent" : "default"}>
                    {user.kind.toUpperCase()}
                  </Pill>
                )}
              </div>
              <div style={{ fontWeight: 600, fontSize: "15px", marginTop: 2 }}>
                {user?.displayName || t.common.loading}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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

      <div className={styles.rightCol}>
      {/* Create Room Card */}
      <div className={styles.card}>
        <div className={styles.cardTitle}>{t.home.createTitle}</div>
        <form onSubmit={handleCreateRoom} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <TextField
            label={t.home.roomTitleLabel}
            placeholder={t.home.roomTitlePlaceholder}
            value={roomTitle}
            onChange={(e) => setRoomTitle(e.target.value)}
          />

          <div style={{ display: "flex", gap: 8 }}>
            <Button
              type="button"
              variant={visibility === "private" ? "primary" : "secondary"}
              size="sm"
              onClick={() => setVisibility("private")}
              icon={<Lock size={14} />}
              style={{ flex: 1 }}
            >
              {t.home.privateMode}
            </Button>
            <Button
              type="button"
              variant={visibility === "public" ? "primary" : "secondary"}
              size="sm"
              onClick={() => setVisibility("public")}
              icon={<Globe size={14} />}
              style={{ flex: 1 }}
            >
              {t.home.publicMode}
            </Button>
          </div>

          {createError && (
            <div style={{ fontSize: "13px", color: "var(--color-danger)" }}>
              {createError}
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            loading={createLoading}
            disabled={connectionStatus !== "connected"}
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
        <form onSubmit={handleJoinRoom} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
            <div style={{ fontSize: "13px", color: "var(--color-danger)" }}>
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