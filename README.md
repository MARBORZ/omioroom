# OMIOROOM

> Minimalist anonymous two-person video watch party platform with a **Bold Minimal × Retro / VHS** aesthetic.

![Open Source](https://img.shields.io/badge/Open%20Source-Yes-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue)
![React](https://img.shields.io/badge/React-19-blue)
![Express](https://img.shields.io/badge/Express-4-lightgrey)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4-black)

---

## Architecture Overview

```
┌─────────────────────────────────┐
│     Client A (Web / Mobile)     │
└───────────────┬─────────────────┘
                │
                │ HTTPS / WSS
                ▼
┌─────────────────────────────────┐
│   Vercel (React + Vite + FSD)   │
└───────────────┬─────────────────┘
                │
                │ Cloudflare Tunnel
                ▼
┌─────────────────────────────────┐
│  Local Backend (Owner Server)   │
│   Express + TS + Socket.IO      │
│   In-Memory Authoritative Store │
└─────────────────────────────────┘
```

- **Frontend (`apps/web`)**: React 19 + TypeScript + Vite + SCSS tokens. Deployed to Vercel. Feature-Sliced Design (FSD).
- **Backend (`apps/server`)**: Express + TypeScript + Socket.IO. Runs locally on the owner's machine. Exposed publicly via a secure tunnel (e.g., Cloudflare Tunnel).
- **Contracts (`packages/contracts`)**: Shared TypeScript types, Zod schemas, error codes, and WebSocket envelope protocols.

---

## Key Features

- **Strict Two-Person Rooms**: Max 2 active participants per room. 3rd participant is rejected with `ROOM_FULL`.
- **Authoritative Video Sync**:
  - Millisecond-level clock drift compensation (`estimatedServerNow`).
  - Drift thresholds: <250ms ignored; 250–750ms tempo adjustment; >750ms seek.
  - Command deduplication via `commandId` and monotonic state `revision`.
- **Public & Private Rooms**:
  - Global 6-digit Room ID (e.g. `482731`) for discovery/joining.
  - Private rooms require a cryptographically hashed secret invite key.
  - Key rotation and revocation (owner-only).
- **Anonymous & Quick Entry**:
  - Instant session generation (no forced registration).
  - Customizable display nickname (`quiet-fox-482`, `velvet-pilot-109`).
  - "My Rooms" dashboard for managing multiple rooms.
- **Player Adapters**:
  - Native HTML5 Video (`.mp4`, `.webm`).
  - Official YouTube IFrame Player API.

---

## Getting Started Locally

### Prerequisites
- Node.js >= 20.x
- npm >= 10.x

### Installation

```bash
git clone https://github.com/MARBORZ/omioroom.git
cd omioroom
npm install
```

### Running in Development

In the repository root:

```bash
# Start backend (port 4000) and frontend (port 5173)
npm run dev:server
npm run dev:web
```

- Web UI: [http://localhost:5173](http://localhost:5173)
- Server Health Check: [http://localhost:4000/health](http://localhost:4000/health)

### Running Tests & Typecheck

```bash
# Run unit & domain tests across all packages
npm run test

# Run strict TypeScript typecheck
npm run typecheck

# Production build test
npm run build
```

---

## Production Deployment & Cloudflare Tunnel

### 1. Tunnel Setup (Locally)
To expose the local Express + Socket.IO backend securely:

```bash
# Install cloudflared (macOS example)
brew install cloudflared

# Run a quick ad-hoc tunnel to port 4000
cloudflared tunnel --url http://localhost:4000
```
This gives you a public HTTPS/WSS URL, e.g. `https://your-tunnel.trycloudflare.com`.

### 2. Frontend Deployment (Vercel)
1. Push this repository to GitHub: `https://github.com/MARBORZ/omioroom`.
2. Import the project into [Vercel](https://vercel.com).
3. Set the Root Directory to `apps/web`.
4. Configure the environment variable:
   - `VITE_API_URL`: `https://your-tunnel.trycloudflare.com`
5. Deploy!

---

## Design System

Inspired by **Bold Minimal × Retro / VHS**:
- Dark primary palette (`#101010`, `#191919`, `#222222`).
- Analog warm accent color (`#FF6847`).
- Clean typography: `Inter` for interface, `IBM Plex Mono` for timecodes and room codes.
- Restrained analog details: subtle indicators, no gimmicky constant scanlines or video distortion.

---

## License

MIT © Open Source
