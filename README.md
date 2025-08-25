# Video-Confirence

Lightweight WebRTC demo app using Socket.IO for signaling and a small RTCPeerConnection wrapper for peer-to-peer audio/video.

This repository contains:

- `server.js` - Node/Express + Socket.IO signaling server
- `frontend/` - Vite + React frontend that captures camera/microphone and uses WebRTC to form P2P calls

---

## Quick overview

- Signaling: Socket.IO carries SDP offers/answers and ICE candidates between peers (server acts as a relay).
- Media: audio/video flows directly between browsers using WebRTC (RTCPeerConnection) unless a TURN server is used (then media may be relayed).
- Key files:
  - `frontend/src/AppWebRTC.jsx` — UI and socket logic
  - `frontend/src/webrtc-helper.js` — RTCPeerConnection wrapper (adds tracks, handles ontrack/onicecandidate)
  - `server.js` — simple signaling relay using Socket.IO

---

## Prerequisites

- Node.js (v18+ recommended)
- npm (comes with Node.js)
- A modern browser with WebRTC support (Chrome, Edge, Firefox)

Optional for production or NAT testing:

- Valid TURN server credentials (if you need reliable traversal across restrictive NATs)

---

## Libraries used (install these via npm)

Server (root `package.json`):

- express
- socket.io
- nodemon (dev convenience for `npm run dev`)

Frontend (`frontend/package.json`):

- react, react-dom
- vite (dev server / build)
- @mui/material, @mui/icons-material (UI)
- socket.io-client (signaling client)
- simple-peer (alternative helper included)
- react-copy-to-clipboard

The exact versions used are in `package.json` and `frontend/package.json`.

---

## Install & run (PowerShell)

Open two terminals (one for server, one for frontend) and run the following commands from the repository root.

1. Install server deps and start the signaling server (root):

```powershell
cd "c:\Users\bryan\Desktop\Personal Proj\2025\Video-Confirence"
npm install
npm run dev    # starts nodemon server.js (listens on port 5000 by default)
```

2. Install frontend deps and run the Vite dev server (frontend):

```powershell
cd "c:\Users\bryan\Desktop\Personal Proj\2025\Video-Confirence\frontend"
npm install
npm run dev    # starts Vite on port 5173 (open http://localhost:5173)
```

Notes:

- The server `server.js` expects the frontend at `http://localhost:5173` in its CORS configuration. If you run Vite on a different port, update `server.js` CORS origin.
- You can run the server directly with `node server.js` instead of `npm run dev` if you prefer.

---

## How to use (manual)

1. Open the frontend URL in two browser windows or two devices: `http://localhost:5173`.
2. Each client will connect to the signaling server and receive a socket id (displayed in the UI 'Copy ID' button).
3. Copy the ID from one client into the other client's "ID to call" field and click the call button.
4. The callee will see an incoming call prompt — click Answer.
5. After the SDP/ICE handshake completes, remote audio/video will appear.

For local testing, mute the remote `<video>` element if you experience feedback/echo.

---

## Troubleshooting

- No remote video: open browser devtools console and look for these logs:
  - `Received stream from peer:` in the frontend console
  - `[WebRTC] ICE connection state:` and a final `connected` or `completed` in `webrtc-helper.js` logs
  - Socket events: `callUser`, `callAccepted`, `iceCandidate` logs in `AppWebRTC.jsx` console
- Autoplay blocked: browsers often block autoplay with sound — we attempt `.play()` and fall back to muting the video. For testing, set the remote video `muted` attribute.
- ICE stuck in `checking`: ensure STUN/TURN config is reachable; if peers are across restrictive NATs, you may need a working TURN server. Check `webrtc-helper.js` iceServers config.
- Camera errors: check that no other app is exclusively holding the camera and that the browser has permission to use camera/microphone.

---

## Development notes

- The signaling server is intentionally minimal; it only relays messages and does not persist state beyond connected sockets.
- The `webrtc-helper.js` file builds a MediaStream from incoming tracks if `event.streams[0]` is not present — that helps interop across browsers.

---

If you'd like, I can:

- add a small `npm run start-all` script that launches both server and frontend concurrently, or
- add a UI indicator showing whether the connection is direct (host/srflx) or relayed (relay/TURN) using getStats.

---
