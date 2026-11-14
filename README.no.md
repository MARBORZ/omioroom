# OMIOROOM

[English](README.md) · Norsk

Watch party for venner – 2 til 32 personer i ett rom, videoen spilles synkront for alle. Ingen egen server: React på Vercel + Supabase (Auth, Postgres, Realtime).

- Anonym, kallenavn eller registrert konto
- Offentlige og private rom, private åpnes med hemmelig kode
- Eieren velger hvem som styrer avspillingen – alle, utvalgte eller bare eieren
- YouTube, VK Video, RuTube, Vimeo
- Chat med bilder, talechat for opptil 8 personer (WebRTC), venneliste

## Hvordan det virker

| Del | Hvor | Hva |
|---|---|---|
| `apps/web` | Vercel | React + Vite, Feature-Sliced Design |
| `supabase/migrations` | Supabase | tabeller, RLS, RPC-funksjoner |
| `packages/contracts` | delt | typer, Zod-skjemaer, URL-parsing, synk-matte |

Alle skriveoperasjoner går gjennom databasefunksjoner (`create_room`, `join_room`, `player_command`, `send_chat` osv.). De sjekker tilganger, romgrenser og rate limits, og holder den ekte avspillingsstatusen i Postgres. Klientene får oppdateringer via Realtime, RLS sørger for at bare medlemmer av rommet ser dem.

Serveren får bare hendelser – play, pause, seek, chatmelding, heartbeat hvert 45. sekund. Posisjonen regnes ut på hver enhet fra ett ankerpunkt (posisjon + servertid + hastighet). Hvis lederens video stopper opp, venter rommet på ham i opptil 10 s. Hvis noen andre henger etter, tar han igjen selv.

## Kjør

```bash
npm install
cp apps/web/.env.example apps/web/.env.local
npm run dev
npm run typecheck && npm test
```

`.env.local` trenger `VITE_SUPABASE_URL` og `VITE_SUPABASE_ANON_KEY`. Lokal Supabase fungerer med `supabase start` (krever Docker).

Testene i `supabase/tests` kjører de ekte migrasjonene på innebygd Postgres (PGlite) og sjekker tilganger, private koder, avspillingsregler og chat.

## Deploy

1. Supabase – lag prosjekt, slå på anonyme innlogginger, kjør `supabase/setup.sql` i SQL-editoren. `pg_cron` stenger tomme rom etter 7 dager.
2. Vercel – importer repoet, root directory `apps/web`, legg inn de to env-variablene over.
3. I Supabase setter du Site URL til Vercel-domenet.

Talechat bak streng NAT trenger en TURN-server: `VITE_TURN_URL`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL`.
