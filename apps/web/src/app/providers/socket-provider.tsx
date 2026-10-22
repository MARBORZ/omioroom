import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
import type { Socket } from "socket.io-client";
import {
  ClientCommand,
  type User,
  type SessionInfoDto,
  type Session,
} from "@omioroom/contracts";
import {
  createSocketClient,
  emitCommand,
  setStoredSessionToken,
} from "../../shared/api/socket.js";
import { TimeSyncClient } from "../../shared/api/time-sync.js";
import type { ConnectionStatusType } from "../../shared/ui/status-indicator/status-indicator.js";

interface SocketContextValue {
  socket: Socket;
  timeSync: TimeSyncClient;
  connectionStatus: ConnectionStatusType;
  user: User | null;
  session: Session | null;
  updateDisplayName: (name: string) => Promise<User>;
}

const SocketContext = createContext<SocketContextValue | null>(null);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const socket = useMemo(() => createSocketClient(), []);
  const timeSync = useMemo(() => new TimeSyncClient(socket), [socket]);

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatusType>("connecting");
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const handleConnect = async () => {
      setConnectionStatus("connected");
      timeSync.startSync();

      try {
        const info = await emitCommand<void, SessionInfoDto>(socket, ClientCommand.SESSION_ME, undefined as any);
        setUser(info.user);
        setSession(info.session as any);
        setStoredSessionToken(info.session.id);
      } catch (err) {
        console.error("Failed to fetch session:", err);
      }
    };

    const handleDisconnect = (reason: string) => {
      timeSync.stopSync();
      if (reason === "io server disconnect") {
        setConnectionStatus("disconnected");
      } else {
        setConnectionStatus("reconnecting");
      }
    };

    const handleConnectError = () => {
      setConnectionStatus("disconnected");
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      timeSync.stopSync();
      socket.disconnect();
    };
  }, [socket, timeSync]);

  const updateDisplayName = async (name: string): Promise<User> => {
    const updated = await emitCommand<{ displayName: string }, User>(
      socket,
      ClientCommand.USER_UPDATE_DISPLAY_NAME,
      { displayName: name }
    );
    setUser(updated);
    return updated;
  };

  return (
    <SocketContext.Provider
      value={{
        socket,
        timeSync,
        connectionStatus,
        user,
        session,
        updateDisplayName,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export function useSocketContext(): SocketContextValue {
  const ctx = useContext(SocketContext);
  if (!ctx) {
    throw new Error("useSocketContext must be used within a SocketProvider");
  }
  return ctx;
}
