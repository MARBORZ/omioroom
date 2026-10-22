import React, { useState } from "react";
import { Plus, LogIn, Edit2, Check, Tv, Lock, Globe } from "lucide-react";
import { useSocketContext } from "../../../app/providers/socket-provider.js";
import { useI18n } from "../../../shared/lib/i18n/index.js";
import { Button } from "../../../shared/ui/button/button.js";
import { TextField } from "../../../shared/ui/text-field/text-field.js";
import { StatusIndicator } from "../../../shared/ui/status-indicator/status-indicator.js";
import { LangSwitch } from "../../../shared/ui/lang-switch/lang-switch.js";
import { emitCommand } from "../../../shared/api/socket.js";
import {
  ClientCommand,
  type CreateRoomPayload,
  type RoomCreateResult,
  type JoinRoomPayload,
  type RoomSnapshotDto,
} from "@omioroom/contracts";
import styles from "./home-page.module.scss";

interface HomePageProps {
  onRoomJoined: (snapshot: RoomSnapshotDto, ownerAccessKey?: string | null) => void;
  onNavigateMyRooms: () => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  onRoomJoined,
  onNavigateMyRooms,
}) => {
  const { socket, connectionStatus, user, updateDisplayName } = useSocketContext();
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
      const payload: CreateRoomPayload = {
        title: roomTitle.trim() || "Watch Room",
        visibility,
      };

      const result = await emitCommand<CreateRoomPayload, RoomCreateResult>(
        socket,
        ClientCommand.ROOM_CREATE,
        payload
      );

      onRoomJoined(result.snapshot, result.ownerAccess?.privateCode ?? null);
    } catch (err: any) {
      setCreateError(err.message || t.home.errors.genericCreateError);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError(null);
    setJoinLoading(true);

    try {
      const payload: JoinRoomPayload = {
        globalId: joinCode.trim(),
        privateCode: joinPrivateCode.trim() || undefined,
      };

      const snapshot = await emitCommand<JoinRoomPayload, RoomSnapshotDto>(
        socket,
        ClientCommand.ROOM_JOIN,
        payload
      );

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
        setJoinError(err.message || t.home.errors.genericJoinError);
      }
    } finally {
      setJoinLoading(false);
    }
  };

  return (
    <div className={styles.homeContainer}>
      {/* Top bar with language switch */}
      <div style={{ width: "100%", display: "flex", justifyContent: "flex-end" }}>
        <LangSwitch />
      </div>

      {/* Hero */}
      <div className={styles.hero}>
        <div className={styles.brand}>
          <span style={{ width: 10, height: 10, backgroundColor: "var(--color-accent)", borderRadius: 2 }} />
          {t.common.brand}
        </div>
        <p className={styles.tagline}>
          {t.home.tagline}
        </p>
        <StatusIndicator status={connectionStatus} style={{ marginTop: 4 }} />
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
              <div style={{ fontSize: "11px", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                {t.home.watchingAs}
              </div>
              <div style={{ fontWeight: 600, fontSize: "15px" }}>
                {user?.displayName || t.common.loading}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
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
  );
};
