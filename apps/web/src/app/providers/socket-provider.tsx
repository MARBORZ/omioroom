import React, { useEffect, useState, useMemo } from "react";
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

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatusType>("connecting");
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const fetchSession = async () => {
      try {
        const info = await emitCommand<void, SessionInfoDto>(
          socket,
          ClientCommand.SESSION_ME,
          undefined as any
        );
        if (!isCancelled) {
          setUser(info.user);
          setSession(info.session as any);
          setStoredSessionToken(info.session.id);
          setConnectionStatus("connected");
        }
      } catch (err) {
        console.error("Failed to fetch session:", err);
      }
    };

    const handleConnect = () => {
      if (!isCancelled) {
        setConnectionStatus("connected");
        timeSync.startSync();
        fetchSession();
      }
    };

    const handleDisconnect = (reason: string) => {
      timeSync.stopSync();
      if (!isCancelled) {
        if (reason === "io server disconnect") {
          setConnectionStatus("disconnected");
        } else {
          setConnectionStatus("reconnecting");
        }
      }
    };

    const handleConnectError = () => {
      if (!isCancelled) {
        setConnectionStatus("disconnected");
      }
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);

    if (socket.connected) {
      handleConnect();
    }

    return () => {
      isCancelled = true;
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

  const register = async (username: string, password: string): Promise<User> => {
    const res = await emitCommand<{ username: string; password: string }, { user: User; session: Session }>(
      socket,
      ClientCommand.USER_REGISTER,
      { username, password }
    );
    setUser(res.user);
    setSession(res.session);
    setStoredSessionToken(res.session.id);
    return res.user;
  };

  const login = async (username: string, password: string): Promise<User> => {
    const res = await emitCommand<{ username: string; password: string }, { user: User; session: Session }>(
      socket,
      ClientCommand.USER_LOGIN,
      { username, password }
    );
    setUser(res.user);
    setSession(res.session);
    setStoredSessionToken(res.session.id);
    return res.user;
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
        register,
        login,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};
