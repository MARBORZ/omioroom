import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorCode, createProtocolError, type User } from "@omioroom/contracts";
import { supabase } from "../../shared/api/supabase.js";
import { backend } from "../../shared/api/backend.js";
import { TimeSyncClient } from "../../shared/api/time-sync.js";
import type { ConnectionStatusType } from "../../shared/model/connection.js";
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
        // Restore the identity stored in this browser. A visitor who has not chosen anything yet
        // gets no account: anonymous users are created only on demand (see ensureUser).
        const { data } = await supabase.auth.getSession();
        if (data.session?.user) {
          try {
            await refreshProfile(data.session.user.id);
          } catch (profileErr) {
            console.warn("Saved session profile missing or user deleted, resetting session:", profileErr);
            // Saved session belongs to a deleted account: sign out and create an anonymous account afresh
            await supabase.auth.signOut().catch(() => {});
            const res = await supabase.auth.signInAnonymously();
            if (res.data?.user) {
              await refreshProfile(res.data.user.id);
            }
          }
        }
        setConnectionStatus(navigator.onLine ? "connected" : "reconnecting");
      } catch (err) {
        console.error("Session bootstrap failed, attempting anonymous fallback:", err);
        try {
          await supabase.auth.signOut().catch(() => {});
          const res = await supabase.auth.signInAnonymously();
          if (res.data?.user) {
            await refreshProfile(res.data.user.id);
            setConnectionStatus(navigator.onLine ? "connected" : "reconnecting");
            return;
          }
        } catch (anonErr) {
          console.error("Anonymous fallback failed:", anonErr);
        }
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
  }, [refreshProfile]);

  // The database clock is only readable by signed-in users
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    timeSync.startSync();
    return () => timeSync.stopSync();
  }, [userId, timeSync]);

  // If online but in disconnected state, automatically recover session and create anonymous account
  useEffect(() => {
    if (connectionStatus !== "disconnected") return;
    const retry = setTimeout(async () => {
      if (!navigator.onLine) return;
      try {
        await supabase.auth.signOut().catch(() => {});
        const res = await supabase.auth.signInAnonymously();
        if (res.data?.user) {
          await refreshProfile(res.data.user.id);
          setConnectionStatus("connected");
        }
      } catch (err) {
        console.error("Auto-recovery of session failed:", err);
      }
    }, 2500);
    return () => clearTimeout(retry);
  }, [connectionStatus, refreshProfile]);

  const ensuring = useRef<Promise<User> | null>(null);
  const ensureUser = useCallback((): Promise<User> => {
    if (ensuring.current) return ensuring.current;
    const run = (async () => {
      // One tab at a time, so two tabs opened together do not create two anonymous users
      const withLock = <T,>(fn: () => Promise<T>): Promise<T> =>
        navigator.locks ? (navigator.locks.request("omioroom-auth", fn) as Promise<T>) : fn();

      return withLock(async () => {
        const { data } = await supabase.auth.getSession();
        let id = data.session?.user.id;
        if (id) {
          try {
            return await refreshProfile(id);
          } catch (profileErr) {
            console.warn("User in saved session is missing/deleted, clearing session:", profileErr);
            await supabase.auth.signOut().catch(() => {});
            id = undefined;
          }
        }
        if (!id) {
          const res = await supabase.auth.signInAnonymously();
          if (res.error || !res.data.user) authError(res.error?.message ?? "Anonymous sign-in failed");
          id = res.data.user.id;
        }
        return refreshProfile(id);
      });
    })().finally(() => {
      ensuring.current = null;
    });
    ensuring.current = run;
    return run;
  }, [refreshProfile]);

  const updateDisplayName = useCallback(
    async (name: string): Promise<User> => {
      await ensureUser();
      const updated = await backend.updateDisplayName(name);
      return refreshProfile(updated.id);
    },
    [refreshProfile, ensureUser]
  );

  const register = useCallback(
    async (username: string, email: string, password: string): Promise<User> => {
      if (!(await backend.usernameAvailable(username))) {
        throw createProtocolError(ErrorCode.INVALID_PAYLOAD, "Username is already taken");
      }
      const { data: current } = await supabase.auth.getSession();
      if (current.session?.user) {
        // Upgrading the anonymous user in place keeps its id, and with it its rooms
        const { data, error } = await supabase.auth.updateUser({ email, password, data: { username } });
        if (error || !data.user) authError(error?.message ?? "Registration failed");
        return refreshProfile(data.user.id);
      }
      // Fresh visitor: register directly, no throwaway anonymous account in between
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { username } } });
      if (error || !data.user) authError(error?.message ?? "Registration failed");
      if (!data.session) authError("CONFIRM_EMAIL");
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
    setUser(null);
  }, []);

  return (
    <SessionContext.Provider
      value={{ timeSync, connectionStatus, user, ensureUser, updateDisplayName, register, login, signOut }}
    >
      {children}
    </SessionContext.Provider>
  );
};
