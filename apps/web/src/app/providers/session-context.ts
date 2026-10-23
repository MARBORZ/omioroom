import { createContext, useContext } from "react";
import type { User } from "@omioroom/contracts";
import type { TimeSyncClient } from "../../shared/api/time-sync.js";
import type { ConnectionStatusType } from "../../shared/model/connection.js";

export interface SessionContextValue {
  timeSync: TimeSyncClient;
  connectionStatus: ConnectionStatusType;
  sessionReady: boolean;
  user: User | null;
  /** Returns the current user, creating the anonymous identity on first need (never on page load). */
  ensureUser: () => Promise<User>;
  updateDisplayName: (name: string) => Promise<User>;
  /** Turns the current (anonymous) identity into a permanent account, keeping its rooms. */
  register: (username: string, email: string, password: string) => Promise<User>;
  login: (email: string, password: string) => Promise<User>;
  signOut: () => Promise<void>;
}

export const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return ctx;
}
