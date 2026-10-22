import React, { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "./providers/session-context.js";
import ReactDOM from "react-dom/client";
import { I18nProvider, useI18n } from "../shared/lib/i18n/index.js";
import { SettingsProvider } from "../shared/lib/settings/index.js";
import { isBackendConfigured } from "../shared/api/supabase.js";
import { backend } from "../shared/api/backend.js";
import { SessionProvider } from "./providers/session-provider.js";
import { HomePage } from "../pages/home/ui/home-page.js";
import { MyRoomsPage } from "../pages/my-rooms/ui/my-rooms-page.js";
import { RoomPage } from "../pages/room/ui/room-page.js";
import { InvitePage } from "../pages/invite/ui/invite-page.js";
import { IdentityPage } from "../pages/identity/ui/identity-page.js";
import type { RoomSnapshotDto } from "@omioroom/contracts";
import { applyMotionTokens } from "../shared/config/motion.js";
import { BootSplash } from "./boot-splash.js";
import { ConnectionNotice } from "../shared/ui/connection-notice/connection-notice.js";
import { ToastContainer, showToast } from "../shared/ui/toast/toast.js";
import {
  getStoredActiveRoom,
  setStoredActiveRoom,
  clearStoredActiveRoom,
} from "../shared/lib/active-room.js";
import { Loader } from "../shared/ui/loader/loader.js";
import { Button } from "../shared/ui/button/button.js";
import setupStyles from "./styles/setup-notice.module.scss";
import resumeStyles from "./styles/resume-screen.module.scss";
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
  const { t } = useI18n();

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

  // Auto-resume state: if stored room exists and no invite in URL, resume without home screen flash
  const [isResuming, setIsResuming] = useState(() => !invite && Boolean(getStoredActiveRoom()));
  const [resumeError, setResumeError] = useState<string | null>(null);
  const resumeAttemptedRef = useRef(false);

  const handleRoomJoined = useCallback((snapshot: RoomSnapshotDto, key?: string | null) => {
    setStoredActiveRoom({
      roomId: snapshot.room.id,
      globalId: snapshot.room.globalId,
    });
    setActiveRoomSnapshot(snapshot);
    setOwnerKey(key ?? null);
    setScreen("room");
    window.location.hash = `room=${snapshot.room.globalId}`;
  }, []);

  const handleLeaveRoom = useCallback(() => {
    clearStoredActiveRoom();
    setActiveRoomSnapshot(null);
    setOwnerKey(null);
    setScreen("home");
    window.location.hash = "";
  }, []);

  const attemptResume = useCallback(async () => {
    const stored = getStoredActiveRoom();
    if (!stored) {
      setIsResuming(false);
      return;
    }
    setResumeError(null);
    try {
      const snapshot = await backend.resumeRoom(stored.roomId);
      handleRoomJoined(snapshot);
      setIsResuming(false);
    } catch (err: any) {
      if (err?.code === "ROOM_CLOSED") {
        clearStoredActiveRoom();
        showToast(t.room.roomClosedNotice, { id: "room-closed" });
        setIsResuming(false);
        setScreen("home");
      } else if (err?.code === "ROOM_NOT_FOUND") {
        clearStoredActiveRoom();
        showToast(t.room.roomNotFoundNotice, { id: "room-not-found" });
        setIsResuming(false);
        setScreen("home");
      } else if (err?.code === "BANNED") {
        clearStoredActiveRoom();
        showToast(t.room.bannedNotice, { id: "room-banned" });
        setIsResuming(false);
        setScreen("home");
      } else if (err?.code === "NOT_MEMBER") {
        clearStoredActiveRoom();
        showToast(t.room.notMemberNotice, { id: "room-not-member" });
        setIsResuming(false);
        setScreen("home");
      } else {
        // Network connectivity error: keep stored active room, offer retry button
        setResumeError(t.room.noConnectionNotice);
      }
    }
  }, [handleRoomJoined, t]);

  useEffect(() => {
    if (isResuming && user && connectionStatus === "connected" && !resumeAttemptedRef.current) {
      resumeAttemptedRef.current = true;
      void attemptResume();
    }
  }, [isResuming, user, connectionStatus, attemptResume]);

  if (isResuming) {
    return (
      <div className={resumeStyles.resumeContainer}>
        {resumeError ? (
          <div className={resumeStyles.resumeErrorCard}>
            <h3>{t.room.noConnectionNotice}</h3>
            <div className={resumeStyles.resumeActions}>
              <Button onClick={() => void attemptResume()} size="sm">
                {t.room.retry}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  clearStoredActiveRoom();
                  setIsResuming(false);
                  setScreen("home");
                }}
              >
                {t.invite.toHome}
              </Button>
            </div>
          </div>
        ) : (
          <div className={resumeStyles.resumeLoader}>
            <Loader size="md" />
            <p className={resumeStyles.resumeText}>{t.room.resumingRoom}</p>
          </div>
        )}
      </div>
    );
  }

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
  <div className={setupStyles.setupContainer}>
    <h1 className={setupStyles.title}>OMIOROOM is not configured</h1>
    <p className={setupStyles.description}>
      Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (see <code>apps/web/.env.example</code>) and
      apply <code>supabase/migrations</code> to your Supabase project. Details are in the README.
    </p>
  </div>
);

const MainApp: React.FC = () => {
  const { connectionStatus } = useSession();
  return (
    <>
      <BootSplash ready={connectionStatus !== "connecting"} />
      <ConnectionNotice status={connectionStatus} />
      <MainScreens />
      <ToastContainer />
    </>
  );
};

export const App: React.FC = () => {
  return (
    <SettingsProvider>
      <I18nProvider>
        {!isBackendConfigured ? (
          <>
            <BootSplash />
            <SetupNotice />
          </>
        ) : (
          <SessionProvider>
            <MainApp />
          </SessionProvider>
        )}
      </I18nProvider>
    </SettingsProvider>
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
