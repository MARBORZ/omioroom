import React, { useEffect, useState, useMemo, useRef } from "react";
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
import { SocketContext } from "./socket-context.js";

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // createSocketClient() returns a module-level singleton, safe for StrictMode double-mount
  const socket = useMemo(() => createSocketClient(), []);
  const timeSync = useMemo(() => new TimeSyncClient(socket), [socket]);
  const isMountedRef = useRef(false);

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatusType>("connecting");
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    // Guard against StrictMode double-mount: only set up once
    if (isMountedRef.current) return;
    isMountedRef.current = true;

    const fetchSession = async () => {
      try {
        const info = await emitCommand<void, SessionInfoDto>(
          socket,
          ClientCommand.SESSION_ME,
          undefined as any
        );
        setUser(info.user);
        setSession(info.session as any);
        setStoredSessionToken(info.session.id);
        setConnectionStatus("connected");
      } catch (err) {
        console.error("Failed to fetch session:", err);
      }
    };

    const handleConnect = () => {
      setConnectionStatus("connected");
      timeSync.startSync();
      fetchSession();
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

    if (socket.connected) {
      handleConnect();
    }

    // Do NOT disconnect the singleton socket on cleanup —
    // StrictMode unmount/remount would kill the connection mid-handshake.
    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      timeSync.stopSync();
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
