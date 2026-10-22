import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import { SocketProvider, useSocketContext } from "./providers/socket-provider.js";
import { HomePage } from "../pages/home/ui/home-page.js";
import { MyRoomsPage } from "../pages/my-rooms/ui/my-rooms-page.js";
import { RoomPage } from "../pages/room/ui/room-page.js";
import { emitCommand } from "../shared/api/socket.js";
import {
  ClientCommand,
  type RoomSnapshotDto,
  type JoinRoomPayload,
} from "@omioroom/contracts";
import "./styles/global.scss";

type Screen = "home" | "my-rooms" | "room";

const MainApp: React.FC = () => {
  const { socket, connectionStatus } = useSocketContext();
  const [screen, setScreen] = useState<Screen>("home");
  const [activeRoomSnapshot, setActiveRoomSnapshot] = useState<RoomSnapshotDto | null>(null);
  const [ownerKey, setOwnerKey] = useState<string | null>(null);

  // Auto-join from URL hash if present (e.g. #room=482731&code=XYZ)
  useEffect(() => {
    if (connectionStatus !== "connected") return;

    const hash = window.location.hash;
    if (hash.startsWith("#room=")) {
      const params = new URLSearchParams(hash.slice(1));
      const roomCode = params.get("room");
      const privateCode = params.get("code");

      if (roomCode && /^\d{6}$/.test(roomCode)) {
        emitCommand<JoinRoomPayload, RoomSnapshotDto>(socket, ClientCommand.ROOM_JOIN, {
          globalId: roomCode,
          privateCode: privateCode || undefined,
        })
          .then((snapshot) => {
            setActiveRoomSnapshot(snapshot);
            setOwnerKey(privateCode || null);
            setScreen("room");
          })
          .catch((err) => {
            console.error("Auto-join failed:", err);
          });
      }
    }
  }, [connectionStatus, socket]);

  const handleRoomJoined = (snapshot: RoomSnapshotDto, key?: string | null) => {
    setActiveRoomSnapshot(snapshot);
    setOwnerKey(key ?? null);
    setScreen("room");
    window.location.hash = `room=${snapshot.room.globalId}${key ? `&code=${key}` : ""}`;
  };

  const handleLeaveRoom = () => {
    setActiveRoomSnapshot(null);
    setOwnerKey(null);
    setScreen("home");
    window.location.hash = "";
  };

  if (screen === "room" && activeRoomSnapshot) {
    return (
      <RoomPage
        initialSnapshot={activeRoomSnapshot}
        ownerAccessKey={ownerKey}
        onLeave={handleLeaveRoom}
        onNavigateHome={handleLeaveRoom}
        onNavigateMyRooms={() => setScreen("my-rooms")}
      />
    );
  }

  if (screen === "my-rooms") {
    return (
      <MyRoomsPage
        onBack={() => setScreen("home")}
        onOpenRoom={(snapshot) => handleRoomJoined(snapshot)}
      />
    );
  }

  return (
    <HomePage
      onRoomJoined={handleRoomJoined}
      onNavigateMyRooms={() => setScreen("my-rooms")}
    />
  );
};

export const App: React.FC = () => {
  return (
    <SocketProvider>
      <MainApp />
    </SocketProvider>
  );
};

const rootEl = document.getElementById("root");
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
