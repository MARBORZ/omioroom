// Looks up a video's title and age flags at its platform and reports them to the database, which compares the
// title with the blocked terms and removes the video from the room when it fails.
// Called by the database (trigger request_media_check) with the shared secret in x-cleanup-secret.
import { createClient } from "npm:@supabase/supabase-js@2";

interface Found {
  verdict: "ok" | "blocked" | "unknown";
  reason: string | null;
  /** Everything worth checking against the blocked terms: title, author, description. */
  text: string;
  /** Just the title, for showing in the feed. */
  title?: string;
  thumbnail?: string;
}

const UA = "Mozilla/5.0 (compatible; OMIOROOM-moderation/1.0; +https://www.omioroom.live)";

async function getJson(url: string): Promise<{ status: number; body: Record<string, unknown> | null }> {
  try {
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    const body = res.ok ? await res.json().catch(() => null) : null;
    return { status: res.status, body };
  } catch {
    return { status: 0, body: null };
  }
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

async function lookup(type: string, sourceId: string): Promise<Found> {
  if (type === "youtube") {
    const { status, body } = await getJson(
      `https://www.youtube.com/oembed?url=${encodeURIComponent("https://www.youtube.com/watch?v=" + sourceId)}&format=json`
    );
    // 401 / 403: age-restricted, private or not embeddable
    if (status === 401 || status === 403) return { verdict: "blocked", reason: "restricted", text: "" };
    if (body) return { verdict: "ok", reason: null, text: `${str(body.title)} ${str(body.author_name)}`, title: str(body.title), thumbnail: str(body.thumbnail_url) };
    return { verdict: "unknown", reason: null, text: "" };
  }
  if (type === "vimeo") {
    const { body } = await getJson(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent("https://vimeo.com/" + sourceId)}`);
    if (body) return { verdict: "ok", reason: null, text: `${str(body.title)} ${str(body.author_name)} ${str(body.description)}`, title: str(body.title), thumbnail: str(body.thumbnail_url) };
    return { verdict: "unknown", reason: null, text: "" };
  }
  if (type === "rutube") {
    const id = sourceId.split("_")[0];
    const { body } = await getJson(`https://rutube.ru/api/video/${id}/?format=json`);
    if (body) {
      if (body.is_adult === true) return { verdict: "blocked", reason: "adult", text: str(body.title) };
      const author = (body.author as Record<string, unknown> | undefined)?.name;
      return { verdict: "ok", reason: null, text: `${str(body.title)} ${str(author)} ${str(body.description)}`, title: str(body.title), thumbnail: str(body.thumbnail_url) };
    }
    return { verdict: "unknown", reason: null, text: "" };
  }
  if (type === "vk") {
    const [oid, id] = sourceId.split("_");
    try {
      const res = await fetch(`https://vk.com/video${oid}_${id}`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(8000) });
      const html = res.ok ? await res.text() : "";
      const title = html.match(/<meta property="og:title" content="([^"]*)"/i)?.[1] ?? "";
      const description = html.match(/<meta property="og:description" content="([^"]*)"/i)?.[1] ?? "";
      if (title) return { verdict: "ok", reason: null, text: `${title} ${description}`, title };
    } catch {
      // fall through
    }
    return { verdict: "unknown", reason: null, text: "" };
  }
  if (type === "kodik") {
    return { verdict: "ok", reason: null, text: "Kodik Player", title: "Kodik Player" };
  }
  if (type === "html5" || type === "hls") {
    return { verdict: "ok", reason: null, text: "Direct Media", title: "Direct Media" };
  }
  return { verdict: "unknown", reason: null, text: "" };
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("CLEANUP_SECRET");
  if (!secret || req.headers.get("x-cleanup-secret") !== secret) return new Response("unauthorized", { status: 401 });

  let input: { roomId?: string; type?: string; sourceId?: string };
  try {
    input = await req.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }
  if (!input.roomId || !input.type || !input.sourceId) return new Response("bad request", { status: 400 });

  let found = await lookup(input.type, input.sourceId);
  // Platforms whose titles cannot be read (VK needs an API key) are not allowed in open rooms until they can be checked.
  // Set the function secret UNVERIFIED_ALLOWED to a comma-separated list of types to allow them anyway.
  const allowedUnverified = (Deno.env.get("UNVERIFIED_ALLOWED") ?? "").split(",").map((x) => x.trim());
  if (found.verdict === "unknown" && input.type === "vk" && !allowedUnverified.includes("vk")) {
    found = { verdict: "blocked", reason: "unverifiable", text: "" };
  }
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data, error } = await supabase.rpc("record_media_verdict", {
    p_room_id: input.roomId,
    p_media_key: `${input.type}:${input.sourceId}`,
    p_title: found.text.trim(),
    p_verdict: found.verdict,
    p_reason: found.reason,
    p_display_title: found.title ?? null,
    p_thumbnail_url: found.thumbnail || null,
  });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ verdict: found.verdict, reason: found.reason, removed: data }), {
    headers: { "content-type": "application/json" },
  });
});
