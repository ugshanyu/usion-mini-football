# Usion Mini Football

A small two-player, server-authoritative football game built with Three.js and
Usion SDK v3.

## Architecture

- Railway serves the iframe client, Three.js assets, and `server.bundle.js`.
- Usion's shared rooms runtime loads the server bundle and owns the 30 Hz
  authoritative simulation.
- Each player uses one persistent WebSocket to the rooms runtime.
- The SDK limits input transmission to 30 Hz and keeps only the newest pending
  input.
- Clients render every animation frame, predict their own movement, and smooth
  authoritative snapshots.

Periodic keyframes are state snapshots, not reconnect signals. Connection
recovery is owned by the Usion host and only runs after an actual disconnect or
explicit resync.

## Run

```bash
npm start
```

Open <http://localhost:3000>. Health checks are available at
<http://localhost:3000/health>.

## Test

```bash
npm test
```

## Deploy

`railway.json` contains the Railway health check and restart policy. The
`usion-mini-football / mini-football` Railway service is connected to this
repository's `main` branch and runs in Southeast Asia.

The registered Usion service uses:

- iframe URL:
  <https://mini-football-production-5dd9.up.railway.app/index.html>
- server bundle URL:
  <https://mini-football-production-5dd9.up.railway.app/server.bundle.js>
- health URL:
  <https://mini-football-production-5dd9.up.railway.app/health>

Three.js is vendored for predictable loading; its license is in
`THREE-LICENSE.txt`.
