import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** False when the deployment forgot to set VITE_SUPABASE_* (the app shows a setup screen). */
export const isBackendConfigured = Boolean(url && anonKey);

// The anon key is public by design: access is enforced by RLS and the RPC functions.
export const supabase = createClient(url ?? "http://localhost:54321", anonKey ?? "missing-anon-key", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  realtime: { params: { eventsPerSecond: 10 } },
});
