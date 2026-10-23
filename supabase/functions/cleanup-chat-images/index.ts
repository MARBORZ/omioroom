// Deletes chat images of rooms that no longer exist or are closed.
// Storage files cannot be removed with SQL, so this runs as an Edge Function on a schedule (see the migration
// 20261022002800_chat_image_cleanup.sql). Only callers that know CLEANUP_SECRET are served.
import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "chat-attachments";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const secret = Deno.env.get("CLEANUP_SECRET");
  if (!secret || req.headers.get("x-cleanup-secret") !== secret) {
    return new Response("unauthorized", { status: 401 });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const bucket = supabase.storage.from(BUCKET);

  // Top level of the bucket: one folder per room
  const { data: top, error: listError } = await bucket.list("", { limit: 1000 });
  if (listError) return new Response(JSON.stringify({ error: listError.message }), { status: 500 });
  const roomIds = (top ?? []).map((e) => e.name).filter((name) => UUID.test(name));

  const alive = new Set<string>();
  if (roomIds.length > 0) {
    const { data: active, error } = await supabase.from("rooms").select("id").in("id", roomIds).eq("status", "active");
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    for (const r of active ?? []) alive.add(r.id);
  }

  let removedFiles = 0;
  let clearedRooms = 0;
  for (const id of roomIds) {
    if (alive.has(id)) continue;
    const { data: files } = await bucket.list(id, { limit: 1000 });
    const paths = (files ?? []).map((f) => `${id}/${f.name}`);
    if (paths.length === 0) continue;
    const { error } = await bucket.remove(paths);
    if (!error) {
      removedFiles += paths.length;
      clearedRooms += 1;
    }
  }

  return new Response(JSON.stringify({ checkedRooms: roomIds.length, clearedRooms, removedFiles }), {
    headers: { "content-type": "application/json" },
  });
});
