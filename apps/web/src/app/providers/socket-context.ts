import { createContext, useContext } from "react";
import type { Socket } from "socket.io-client";
import type { User, Session } from "@omioroom/contracts";
import type { TimeSyncClient } from "../../shared/api/time-sync.js";
import type { ConnectionStatusType } from "../../shared/ui/status-indicator/status-indicator.js";

export interface SocketContextValue {
  socket: Socket;
  timeSync: TimeSyncClient;
  connectionStatus: ConnectionStatusType;
  user: User | null;
  session: Session | null;
  updateDisplayName: (name: string) => Promise<User>;
  register: (username: string, password: string) => Promise<User>;
  login: (username: string, password: string) => Promise<User>;
}

export const SocketContext = createContext<SocketContextValue | null>(null);

export function useSocketContext(): SocketContextValue {
  const ctx = useContext(SocketContext);
  if (!ctx) {
    throw new Error("useSocketContext must be used within a SocketProvider");
  }
  return ctx;
}
