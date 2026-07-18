# LAN multiplayer — presence (v1)

## Goal
Drive the same city with a friend on the local network and **see each other's cars** in real time.
No rules, just cruise together. The foundation racing / co-op modes can build on later.

## Decisions (brainstormed 2026-07-18)
- **Scope: presence.** Both load the same city; each renders the other's car (with a name) from a
  live pose feed. No shared physics, no collisions between players — each client is authoritative
  over its own car and broadcasts its pose.
- **Transport: WebRTC peer-to-peer with manual copy-paste signaling.** Pure static site, zero
  server — fits the game's "no backend" ethos and ships as an ordinary browser feature. 2 players
  for v1. (N-player + auto-discovery need a companion server — deferred, pairs with #2 Electron.)

## Why WebRTC copy-paste
A browser can't be a server and can't do LAN discovery, so a pure static site's only serverless
path is WebRTC with the SDP exchanged by hand. On a LAN, ICE gathers host candidates (local IPs)
in milliseconds, so we wait for **gathering-complete** and ship the whole thing in one blob — no
trickle, no STUN/TURN needed. That makes it a clean two-step exchange:
1. Host generates a **room code** and shares it (verbally / chat).
2. Guest pastes it, generates an **answer code**, sends it back.
3. Host pastes the answer. Connected.

## Modules
- `src/net/roomCode.ts` — encode/decode `{ city, sdp }` to a compact string (JSON → fflate deflate
  → base64). fflate is already a dependency. **Pure, unit-tested** (round-trips; rejects garbage).
- `src/net/peer.ts` — the WebRTC wrapper: `host()` → offer code + `onAnswer(code)`; `join(code)` →
  `{ city, answerCode }`; both expose `onPose(cb)`, `send(pose)`, `onState(cb)`, `close()`. The pose
  DataChannel is `{ ordered: false, maxRetransmits: 0 }` — stale poses are dropped, not queued.
- `src/net/protocol.ts` — the pose message shape + (de)serialization (compact typed array or JSON).
  **Pure, unit-tested.**
- `src/app/remotePlayers.ts` — renders each peer's car (`buildVehicleMesh` of their vehicle) plus a
  name sprite above it, interpolating between received poses (like `rivals`). Dispose on city
  change / disconnect. Neon-covered like the other vehicles.
- `src/ui/multiplayerPanel.ts` — a 👥 button by ⚙ opening a panel: **Host** (show room code, accept
  answer code) / **Join** (paste room code, show answer code), with a connection-status line and
  the connected player's name.

## Protocol
Each peer sends its pose at ~18Hz: `{ x, z, y, heading, vehicle, name }`. The receiver interpolates
toward the latest pose (a short lerp) so coarse/lossy updates still read smoothly. The **city is
carried in the room code**, so the guest loads the host's exact city — both worlds match.

## main.ts wiring
- Create the peer/manager + `remotePlayers` + the panel. On connect, start sending `car`'s pose each
  frame and feed received poses to `remotePlayers`; on the loop, `remotePlayers.update(dt)`.
- Guest join loads the coded city (reuses `loadCity`).
- Players are **not** solid to each other in v1 (no collision) — presence only.

## Testing
- Pure: `roomCode` round-trip + rejects junk; `protocol` (de)serialization; pose interpolation.
- The **live WebRTC connection is verified by the user on two machines** — a subagent/headless run
  can't pair two real peers. Remote-car rendering is a visual check too.
- `tsc` / `test` / `build` / `boot-check` as always.

## Not in v1 (follow-ups)
- N players + auto-discovery (companion signaling/relay server; pairs with #2 Electron/Steam).
- Racing / taxi-competition together (builds on presence + the existing trial/rivals).
- Players solid to each other (collision), chat, voice.

## Version
A minor bump when it lands. Given the live half is user-verified, it ships once the pure core is
tested green and a human has confirmed two browsers connect.
