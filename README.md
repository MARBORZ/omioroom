# OMIOROOM

Watch party for friends – 2 to 32 people in one room, video plays in sync for everyone. No own server: React on Vercel + Supabase (Auth, Postgres, Realtime).

- Anonymous, nickname or registered accounts
- Public and private rooms, private ones open with a secret code
- Owner picks who controls playback – everyone, selected people or only owner
- YouTube, VK Video, RuTube, Vimeo
- Chat with images, voice chat up to 8 people (WebRTC), friends list

## How it works

| Part | Where | What |
|---|---|---|
| `apps/web` | Vercel | React + Vite, Feature-Sliced Design |
| `supabase/migrations` | Supabase | tables, RLS, RPC functions |
| `packages/contracts` | shared | types, Zod schemas, URL parsing, sync math |

All writes go through database functions (`create_room`, `join_room`, `player_command`, `send_chat` and so on). They check permissions, room limits and rate limits, and keep the real playback state in Postgres. Clients get updates through Realtime, RLS makes sure only room members see them.

Server gets only events – play, pause, seek, chat message, heartbeat every 45 s. Position is calculated on each device from one anchor (position + server time + speed). If the leader's video stalls, room waits for him up to 10 s. If someone else stalls, he catches up alone.

## Run

```bash
npm install
cp apps/web/.env.example apps/web/.env.local
npm run dev
npm run typecheck && npm test
```

`.env.local` needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Local Supabase works with `supabase start` (needs Docker).

Tests in `supabase/tests` run the real migrations on embedded Postgres (PGlite) and check permissions, private codes, playback rules and chat.

## Deploy

1. Supabase – create project, turn on anonymous sign-ins, run `supabase/setup.sql` in SQL editor. `pg_cron` closes empty rooms after 7 days.
2. Vercel – import repo, root directory `apps/web`, add the two env vars above.
3. In Supabase set Site URL to the Vercel domain.

Voice chat behind strict NAT needs a TURN server: `VITE_TURN_URL`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL`.

Specs are in `docs/`.
