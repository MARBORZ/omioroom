import React, { useEffect, useState } from "react";
import { useSession } from "./providers/session-context.js";
import ReactDOM from "react-dom/client";
import { I18nProvider } from "../shared/lib/i18n/index.js";
import { isBackendConfigured } from "../shared/api/supabase.js";
import { SessionProvider } from "./providers/session-provider.js";
import { HomePage } from "../pages/home/ui/home-page.js";
import { MyRoomsPage } from "../pages/my-rooms/ui/my-rooms-page.js";
import { RoomPage } from "../pages/room/ui/room-page.js";
import { InvitePage } from "../pages/invite/ui/invite-page.js";
import { IdentityPage } from "../pages/identity/ui/identity-page.js";
import type { RoomSnapshotDto } from "@omioroom/contracts";
import { applyMotionTokens } from "../shared/config/motion.js";
import { ConnectionNotice } from "../shared/ui/connection-notice/connection-notice.js";
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

const MainScreens: React.FC = () => {
  const [invite] = useState<InviteTarget | null>(readInviteFromHash);
  const identityChosen = localStorage.getItem("omioroom_identity_chosen") === "true";
  const { user, connectionStatus, ensureUser } = useSession();

  // Identity was chosen before but the stored session is gone: recreate it quietly
  useEffect(() => {
    if (identityChosen && !user && connectionStatus === "connected") void ensureUser().catch(() => {});
  }, [identityChosen, user, connectionStatus, ensureUser]);
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

const SetupNotice: React.FC = () => (
  <div style={{ padding: "48px", maxWidth: 720 }}>
    <h1 style={{ fontSize: 32, marginBottom: 16 }}>OMIOROOM is not configured</h1>
    <p style={{ color: "var(--color-text-muted)", lineHeight: 1.6 }}>
      Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (see <code>apps/web/.env.example</code>) and
      apply <code>supabase/migrations</code> to your Supabase project. Details are in the README.
    </p>
  </div>
);

const MainApp: React.FC = () => {
  const { connectionStatus } = useSession();
  return (
    <>
      <ConnectionNotice status={connectionStatus} />
      <MainScreens />
    </>
  );
};

export const App: React.FC = () => {
  if (!isBackendConfigured) return <SetupNotice />;
  return (
    <I18nProvider>
      <SessionProvider>
        <MainApp />
      </SessionProvider>
    </I18nProvider>
  );
};

const rootEl = document.getElementById("root");
if (rootEl) {
  applyMotionTokens();
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
