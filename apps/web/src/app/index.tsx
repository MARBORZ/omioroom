import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { I18nProvider } from "../shared/lib/i18n/index.js";
import { SocketProvider } from "./providers/socket-provider.js";
import { HomePage } from "../pages/home/ui/home-page.js";
import { MyRoomsPage } from "../pages/my-rooms/ui/my-rooms-page.js";
import { RoomPage } from "../pages/room/ui/room-page.js";
import { InvitePage } from "../pages/invite/ui/invite-page.js";
import { IdentityPage } from "../pages/identity/ui/identity-page.js";
import type { RoomSnapshotDto } from "@omioroom/contracts";
import "./styles/global.scss";

type Screen = "identity" | "invite" | "home" | "my-rooms" | "room";

interface InviteTarget {
  globalId: string;
  code: string | null;
}

/** Reads #room=<id>&code=<key>; the secret is stripped from the address bar immediately. */
let cachedInvite: InviteTarget | null | undefined;

function readInviteFromHash(): InviteTarget | null {
  // StrictMode runs state initializers twice; the hash is only readable once
  if (cachedInvite !== undefined) return cachedInvite;
  cachedInvite = parseInviteHash();
  return cachedInvite;
}

function parseInviteHash(): InviteTarget | null {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const globalId = params.get("room");
  if (!globalId || !/^\d{6}$/.test(globalId)) return null;
  const code = params.get("code");
  if (code) {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#room=${globalId}`);
  }
  return { globalId, code };
}

const MainApp: React.FC = () => {
  const [invite] = useState<InviteTarget | null>(readInviteFromHash);
  const identityChosen = localStorage.getItem("omioroom_identity_chosen") === "true";
  const [screen, setScreen] = useState<Screen>(() => {
    if (invite) return "invite";
    return identityChosen ? "home" : "identity";
  });
  const [activeRoomSnapshot, setActiveRoomSnapshot] = useState<RoomSnapshotDto | null>(null);
  const [ownerKey, setOwnerKey] = useState<string | null>(null);

  const handleRoomJoined = (snapshot: RoomSnapshotDto, key?: string | null) => {
    setActiveRoomSnapshot(snapshot);
    setOwnerKey(key ?? null);
    setScreen("room");
    // Never keep the private key in the address bar; members re-enter via their membership
    window.location.hash = `room=${snapshot.room.globalId}`;
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

  if (screen === "invite" && invite) {
    return (
      <InvitePage
        globalId={invite.globalId}
        initialCode={invite.code}
        autoJoin={identityChosen}
        onJoined={(snapshot) => handleRoomJoined(snapshot)}
        onCancel={handleLeaveRoom}
      />
    );
  }

  if (screen === "identity") {
    return <IdentityPage onSelect={() => setScreen("home")} />;
  }

  if (screen === "my-rooms") {
    return (
      <MyRoomsPage
        onBack={() => setScreen("home")}
        onOpenRoom={(snapshot) => handleRoomJoined(snapshot)}
        onNavigateIdentity={() => setScreen("identity")}
      />
    );
  }

  return (
    <HomePage
      onRoomJoined={handleRoomJoined}
      onNavigateMyRooms={() => setScreen("my-rooms")}
      onNavigateIdentity={() => setScreen("identity")}
    />
  );
};

export const App: React.FC = () => {
  return (
    <I18nProvider>
      <SocketProvider>
        <MainApp />
      </SocketProvider>
    </I18nProvider>
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
