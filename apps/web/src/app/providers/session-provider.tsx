import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorCode, createProtocolError, type User } from "@omioroom/contracts";
import { supabase } from "../../shared/api/supabase.js";
import { backend } from "../../shared/api/backend.js";
import { TimeSyncClient } from "../../shared/api/time-sync.js";
import type { ConnectionStatusType } from "../../shared/ui/status-indicator/status-indicator.js";
import { SessionContext } from "./session-context.js";

interface ProfileRow {
  id: string;
  kind: User["kind"];
  display_name: string;
  username: string | null;
  created_at: string;
  updated_at: string;
}

function toUser(row: ProfileRow): User {
  return {
    id: row.id,
    kind: row.kind,
    displayName: row.display_name,
    normalizedName: row.display_name.trim().toLowerCase(),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSeenAt: null,
  };
}

async function fetchProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return (data as ProfileRow | null) ?? null;
}

async function loadProfile(userId: string): Promise<User> {
  let row = await fetchProfile(userId);
  if (!row) {
    // Account created before the database was set up: let the database create its profile
    await supabase.rpc("ensure_profile");
    row = await fetchProfile(userId);
  }
  if (!row) throw new Error("PROFILE_MISSING");
  return toUser(row);
}

function authError(message: string): never {
  throw createProtocolError(ErrorCode.UNAUTHENTICATED, message);
}

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const timeSync = useMemo(() => new TimeSyncClient(backend.serverTimeMs), []);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatusType>("connecting");
  const [user, setUser] = useState<User | null>(null);
  const bootedRef = useRef(false);

  const refreshProfile = useCallback(async (userId: string) => {
    const profile = await loadProfile(userId);
    setUser(profile);
    return profile;
  }, []);

  useEffect(() => {
    const boot = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        let userId = data.session?.user.id;
        if (!userId) {
          // Anonymous identity lives in this browser's storage only
          const res = await supabase.auth.signInAnonymously();
          if (res.error || !res.data.user) throw res.error ?? new Error("ANON_SIGN_IN_FAILED");
          userId = res.data.user.id;
        }
        await refreshProfile(userId);
        setConnectionStatus(navigator.onLine ? "connected" : "reconnecting");
        timeSync.startSync();
      } catch (err) {
        console.error("Session bootstrap failed:", err);
        setConnectionStatus("disconnected");
      }
    };

    if (!bootedRef.current) {
      bootedRef.current = true;
      void boot();
    }

    const onOnline = () => setConnectionStatus((s) => (s === "disconnected" ? s : "connected"));
    const onOffline = () => setConnectionStatus((s) => (s === "disconnected" ? s : "reconnecting"));
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [refreshProfile, timeSync]);

  const updateDisplayName = useCallback(
    async (name: string): Promise<User> => {
      const updated = await backend.updateDisplayName(name);
      return refreshProfile(updated.id);
    },
    [refreshProfile]
  );

  const register = useCallback(
    async (username: string, email: string, password: string): Promise<User> => {
      if (!(await backend.usernameAvailable(username))) {
        throw createProtocolError(ErrorCode.INVALID_PAYLOAD, "Username is already taken");
      }
      // Upgrading the anonymous user in place keeps its id, and with it its rooms
      const { data, error } = await supabase.auth.updateUser({ email, password, data: { username } });
      if (error || !data.user) authError(error?.message ?? "Registration failed");
      return refreshProfile(data.user.id);
    },
    [refreshProfile]
  );

  const login = useCallback(
    async (email: string, password: string): Promise<User> => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.user) authError("Invalid email or password");
      return refreshProfile(data.user.id);
    },
    [refreshProfile]
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    const res = await supabase.auth.signInAnonymously();
    if (res.error || !res.data.user) authError("Sign out failed");
    await refreshProfile(res.data.user.id);
  }, [refreshProfile]);

  return (
    <SessionContext.Provider
      value={{ timeSync, connectionStatus, user, updateDisplayName, register, login, signOut }}
    >
      {children}
    </SessionContext.Provider>
  );
};
