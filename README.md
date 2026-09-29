# Typing Battle

A real-time two-player typing fighter built with React, Vite, Express, and Socket.IO. The Node server owns rooms, countdowns, commands, combat resolution, health, and results; browsers render the synchronized state.

## Requirements

- Node.js 20 or newer
- npm 9 or newer
- Two browsers or browser tabs for local multiplayer testing

## Install and run

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. The frontend is served by Vite and the Socket.IO server listens at `http://localhost:3001`. Local Vite development proxies Socket.IO automatically, so no environment file is required for local play.

## Play a match

1. Enter a fighter name, choose language and difficulty, then select **Create Room**.
2. Copy the five-character room code and send it to a friend.
3. The friend opens the same deployed site (or a second local tab), enters the code under **Join a battle**, and joins.
4. Both players select **Ready Up**. The room host starts the match.
5. Type each displayed command exactly. Its label tells you whether it is a strike, guard, dodge, movement, counter, or special action.

Hindi content is native Unicode Devanagari. Enable a Hindi keyboard or transliteration input method in the browser/operating system for Hindi and Both modes.

## Scripts

```bash
npm run dev     # client and server together
npm run build   # production client bundle in client/dist
npm run start   # Node game server
npm test        # authoritative game-engine tests
```

## Deployment

Deploy `server/` to any Node host that supports persistent WebSocket connections. Set `PORT` to the host-provided port and set `CLIENT_URL` to the public frontend URL. Deploy `client/` as a static Vite site, and set `VITE_SERVER_URL` at build time to the public server URL, for example `https://typing-battle-api.example.com`.

The frontend and server can live on different hosts. Socket.IO CORS is restricted to `CLIENT_URL` when that variable is supplied. Never put a localhost server URL into a production frontend build.

## Environment variables

Copy `.env.example` to `.env` when configuring deployment.

| Variable | Used by | Purpose |
| --- | --- | --- |
| `PORT` | server | HTTP / Socket.IO listening port; default is `3001`. |
| `CLIENT_URL` | server | Comma-separated browser origins allowed to connect. |
| `VITE_SERVER_URL` | client | Public Socket.IO server URL for a deployed frontend. |

## Project layout

```text
client/             React game UI and Vite configuration
server/             Express and authoritative Socket.IO game server
shared/             combat constants and English/Hindi content
```

## Known limitations

Rooms are stored in memory, so they disappear when the server restarts. Reconnection within a running server is supported using a session token stored in the browser. This first version intentionally has no accounts, matchmaking queue, or database.
