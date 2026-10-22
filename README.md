# OMIOROOM

Watch videos together with friends: 2 to 32 people per room. Open source, no servers to run: **React on Vercel + Supabase** (Auth, Postgres, Realtime).

- Anonymous, nickname, or registered accounts (Supabase Auth; the anonymous identity lives in the browser's storage).
- Public and private rooms with a secret code only the owner sees; room id stays stable when the code is rotated/revoked.
- Voice chat (audio-only WebRTC, up to 8 people) and image sharing in chat (png/jpeg/gif/webp/avif from the device).
- Rooms of 2–32 participants (set by the owner); the owner also picks who controls playback (everyone / owner + selected / owner only); synchronized playback (YouTube, VK Video, RuTube, Vimeo, HLS, MP4/WebM), built-in chat, friends for registered users.

## How it works

| Piece | Where | Role |
|---|---|---|
| `apps/web` | Vercel | React + Vite UI (FSD) |
| `supabase/migrations` | your Supabase project | tables, RLS, RPC functions (the rules) |
| `packages/contracts` | shared | DTO types, Zod schemas, media URL parsing, drift math |

All writes go through database functions (`create_room`, `join_room`, `player_command`, `send_chat`, ...). They check the caller,
enforce the rules (room size limit, control modes, private codes, revisions, command dedup, rate limits) and keep the **authoritative playback state** in
Postgres. Clients read through RLS-protected tables and Realtime (`postgres_changes`), so only room members receive updates.
The room follows a *leader* (whoever issued the last playback command, the owner at first): if the leader's player stalls, everyone waits for it (up to 10 s) at the leader's own position and resumes together; a follower's stall never stops anyone, they catch up on their own. Playback correction is client-side against the database clock (`server_time_ms()`), thresholds 250 ms / 750 ms.

## What the server receives

Only key events, never a stream of positions. Each participant's player runs on their own device and the room state is
recomputed locally from an anchor point (position + server time + speed). What reaches the database:

| Event | When |
|---|---|
| play / pause / seek / speed / change video | a user action (scrubbing is merged into one seek; echo events of our own commands are dropped) |
| chat message / image | when sent |
| join / leave / settings | on the action |
| heartbeat (keeps a seat) | every 45 s per participant |
| clock sample | 3 quick ones at start, then once a minute |
| stall report | only from the room's leader (followers do not send it) |

Snapshot reloads after joins or settings changes are merged and spread over about 2 seconds so a large room does not hit
the database at the same instant. Playback commands are rate limited (60 per 10 s per user).

## Self-host in 10 minutes

1. **Supabase project.** Create one at supabase.com (or run it yourself).
   - Authentication > Sign In / Providers: enable **Allow anonymous sign-ins**. For the simplest beta, disable **Confirm email**.
   - Apply the schema: paste `supabase/setup.sql` into the SQL editor of an empty project, or `supabase link --project-ref <ref> && supabase db push`.
   - Database > Extensions: enable `pg_cron` if you want idle rooms closed automatically (the second migration schedules it).
2. **Vercel.** Import the repo. Set **Root Directory** to `apps/web` (Vite preset; `apps/web/vercel.json` adds the SPA rewrite and the build also compiles `packages/contracts`). Add env vars:
   - `VITE_SUPABASE_URL` = project URL
   - `VITE_SUPABASE_ANON_KEY` = anon (public) key
3. In Supabase Authentication > URL Configuration set **Site URL** to your Vercel domain.

Never expose the `service_role` key to the frontend.

## Develop

```bash
npm install
cp apps/web/.env.example apps/web/.env.local   # fill in your Supabase URL + anon key
npm run dev                                    # http://localhost:5174
npm run typecheck && npm test
```

Local Supabase (needs Docker): `supabase start` then use the printed API URL/anon key.

`npm test` runs the contract/web tests and `supabase/tests`, which apply the real migrations to an embedded Postgres (PGlite)
and verify permissions, private codes, seats, playback rules, chat and friends.

## Voice chat

Audio-only peer-to-peer WebRTC, signaled over a private Realtime channel that only room members can join. It is a mesh (everyone
connects to everyone), so it is capped at 8 people. Behind strict NATs a TURN relay is needed: set `VITE_TURN_URL`,
`VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL` (they end up in the browser, so use a relay with limited credentials).

## Limits

- Each owner has a limit on active rooms (currently 1, set in `room_limit_per_user()`); a room that stays empty for 5 minutes is closed by a scheduled job (`pg_cron`, every minute).
- Chat keeps the last 100 messages per room and is deleted when the room closes.
- A seat frees ~90 s after a participant's last activity (heartbeat every 30 s).
- Realtime presence channels are named by the room's random UUID; row data is protected by RLS.
- Mobile/tablet styling: see `docs/prompts/media.scss.md`.

Specs live in `docs/` (design, technical, user/room/protocol). The transport described there (Socket.IO) has been replaced by Supabase RPC + Realtime; the rules and error codes are unchanged.
