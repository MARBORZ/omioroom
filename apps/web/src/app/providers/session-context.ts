import { createContext, useContext } from "react";
import type { User } from "@omioroom/contracts";
import type { TimeSyncClient } from "../../shared/api/time-sync.js";
import type { ConnectionStatusType } from "../../shared/ui/status-indicator/status-indicator.js";

export interface SessionContextValue {
  timeSync: TimeSyncClient;
  connectionStatus: ConnectionStatusType;
  user: User | null;
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
