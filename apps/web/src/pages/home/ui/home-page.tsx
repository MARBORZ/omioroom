import React, { useState } from "react";
import { Plus, LogIn, Edit2, Check, Tv, Lock, Globe } from "lucide-react";
import { useSocketContext } from "../../../app/providers/socket-provider.js";
import { Button } from "../../../shared/ui/button/button.js";
import { TextField } from "../../../shared/ui/text-field/text-field.js";
import { StatusIndicator } from "../../../shared/ui/status-indicator/status-indicator.js";
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
      setCreateError(err.message || "Failed to create room");
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
        setJoinError("This room is private. Please enter the private access key.");
      } else if (err.code === "INVALID_PRIVATE_CODE") {
        setJoinError("Invalid private key. Please check the invite link.");
      } else if (err.code === "ROOM_FULL") {
        setJoinError("This room is full (maximum 2 participants).");
      } else if (err.code === "ROOM_NOT_FOUND") {
        setJoinError("Room not found. Check the 6-digit code.");
      } else {
        setJoinError(err.message || "Failed to join room");
      }
    } finally {
      setJoinLoading(false);
    }
  };

  return (
    <div className={styles.homeContainer}>
      {/* Hero */}
      <div className={styles.hero}>
        <div className={styles.brand}>
          <span style={{ width: 10, height: 10, backgroundColor: "var(--color-accent)", borderRadius: 2 }} />
          OMIOROOM
        </div>
        <p className={styles.tagline}>
          Minimalist anonymous watch party for two.
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
              placeholder="Your nickname..."
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
              Save
            </Button>
          </div>
        ) : (
          <>
            <div>
              <div style={{ fontSize: "11px", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                Watching as
              </div>
              <div style={{ fontWeight: 600, fontSize: "15px" }}>
                {user?.displayName || "Loading..."}
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
                Change
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<Tv size={13} />}
                onClick={onNavigateMyRooms}
              >
                My Rooms
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Create Room Card */}
      <div className={styles.card}>
        <div className={styles.cardTitle}>Create a Watch Room</div>
        <form onSubmit={handleCreateRoom} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <TextField
            label="Room Title"
            placeholder="e.g. Saturday Movie Night"
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
              Private (Key Required)
            </Button>
            <Button
              type="button"
              variant={visibility === "public" ? "primary" : "secondary"}
              size="sm"
              onClick={() => setVisibility("public")}
              icon={<Globe size={14} />}
              style={{ flex: 1 }}
            >
              Public (Code Only)
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
            Create Room
          </Button>
        </form>
      </div>

      <div className={styles.divider}>OR</div>

      {/* Join Room Card */}
      <div className={styles.card}>
        <div className={styles.cardTitle}>Join Existing Room</div>
        <form onSubmit={handleJoinRoom} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <TextField
            label="Global Room ID (6 Digits)"
            placeholder="482731"
            mono
            maxLength={6}
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, ""))}
            required
          />

          <TextField
            label="Private Invite Key (If room is private)"
            placeholder="Paste private key here if required..."
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
            Join Room
          </Button>
        </form>
      </div>
    </div>
  );
};
