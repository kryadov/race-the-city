# LAN multiplayer — presence over a shared world (v1)

Brainstormed 2026-07-18, **revised 2026-08-20** (transport re-confirmed, seed added, two stale
details corrected — see "What changed in the 2026-08-20 revision" at the bottom).

## Goal

Drive the same city with a friend on the local network and **see each other's cars** in real time,
in a world that looks the same on both screens. No rules, just cruise together. The foundation
racing / co-op modes can build on later.

## Decisions

- **Scope: presence + a shared world.** Both load the same city, from the same seed, under the
  same weather and time of day; each renders the other's car with a name over the roof, driven by
  a live pose feed. No shared physics, no collisions between players — each client stays
  authoritative over its own car and broadcasts its pose.
- **Transport: WebRTC peer-to-peer, signalled by a copy-pasted code.** No server process of any
  kind, so the game stays a static site and works when both players load it from GitHub Pages.
  2 players in v1.
- **No racing in v1.** A shared race needs agreement on the track, the countdown and the finish,
  and it needs bots that don't diverge (see "The honest limit of the shared world"). Presence is
  valuable on its own and ships first.

## Why a copy-pasted code, and not discovery

A browser cannot listen for incoming connections and has no access to mDNS or broadcast, so two
browsers cannot find each other on a LAN by themselves — no API removes this. WebRTC is the only
way a browser reaches another browser directly, and it connects peer-to-peer on a LAN with no
external server involved. What it does *not* do is deliver the one-time exchange of connection
descriptions (SDP + ICE candidates) that has to happen before the connection stands; by spec that
is the application's job. A signalling server exists in other games for that single exchange and
for nothing else — so we do the exchange by hand instead and keep the zero-install property.

On a LAN, ICE gathers host candidates in milliseconds, so we wait for **gathering-complete** and
ship everything in one blob — no trickle, no STUN, no TURN. Three steps:

1. Host generates a **room code** and shares it (chat / verbally).
2. Guest pastes it, gets an **answer code** back, sends that to the host.
3. Host pastes the answer. Connected.

The exchange is inherently two-way; that round-trip cannot be removed while staying serverless.

## Risk to settle FIRST

Chrome hides local IPs behind mDNS candidate names (`<uuid>.local`). On an ordinary home LAN both
peers resolve them and the connection stands, but on a network with client isolation or mDNS
blocked it will not — and that would sink the whole approach. Separately, `http://192.168.x.x`
(the dev server over LAN) is not a secure context, which can restrict WebRTC; GitHub Pages is
HTTPS and unaffected.

Therefore the first step of implementation is a **throwaway probe**, not UI: a bare page on both
machines, codes exchanged by hand, does a DataChannel open — yes or no. Everything else is built
only after that answers yes.

## Modules

- `src/net/roomCode.ts` — encode/decode the room payload to a compact string:
  JSON → `CompressionStream('deflate-raw')` → base64url. No new dependency; `CompressionStream`
  exists in browsers and in Node 18+, so the unit tests exercise the real thing. **Pure,
  unit-tested** (round-trips; rejects garbage and a wrong `v`).
- `src/net/protocol.ts` — the wire messages. **Pure, unit-tested.** Two of them:
  - `hello` — once, on open: `{ name, vehicle }` as JSON.
  - `pose` — the hot path at ~18 Hz: a fixed `Float32Array` `[x, y, z, heading, speed, steer]`.
    `speed`/`steer` are carried so the remote car's wheels spin and turn.
- `src/net/peer.ts` — the `RTCPeerConnection` wrapper. `host()` → room code + `acceptAnswer(code)`;
  `join(code)` → `{ room, answerCode }`. Both expose `onHello`, `onPose`, `sendPose`, `onState`,
  `close()`. The pose DataChannel is `{ ordered: false, maxRetransmits: 0 }` — a stale pose is
  dropped, never queued behind a newer one.
- `src/app/remotePlayers.ts` — renders each peer's car (`buildVehicleMesh` for their vehicle type)
  plus a name sprite above it, interpolating between received poses, following `rivals.ts` for
  shape. Disposed on city change and on disconnect. **Neon-covered** via `ThemeController` like
  every other world mesh — a new mesh that skips this sticks out as a day-styled object at night.
- `src/app/worldSeed.ts` — the session seed and its mulberry32 (matching the generator already used
  by `greenery`, `boats`, `crops`, `carPickups`). A fresh random seed per session; the host's seed
  when a room is joined.

## The room payload

```ts
interface Room {
  v: 1
  city: string // the host's city query — the guest loads exactly this
  seed: number // world seed (see below)
  weather: 'clear' | 'rain' | 'snow' | 'fog' // the host's RESOLVED weather, never 'auto'
  timeMode: 'cycle' | 'day' | 'night'
  time: number // day/night phase 0..1 when the code was made
  sdp: string // offer (room code) or answer (answer code)
}
```

The weather is resolved rather than passed as a `WeatherSetting`: `'auto'` cycles on a timer, so
two clients sharing the *setting* would end up under different skies. `time` pins the sun to the
same starting point for the same reason. The union is spelled out inside `src/net/roomCode.ts`
rather than imported from `src/app/weather.ts`, because `src/net/` must not depend on `src/app/`.

## The shared world, via the seed

`main.ts` already passes `Math.random` into ~20 world factories (`createTraffic`, `createBoats`,
`createTrains`, `createPedestrians`, `buildStreetFurniture`, `createTrafficLights`,
`livingParking`, `buses`, `motorcycles`, `cyclists`, `buildInfill`, `watersideBenchSpots`, and the
same list again on the density/quality rebuild path). Every one of them takes `rand` as a
parameter already, so the change is to pass the session's seeded generator instead of
`Math.random` at those call sites — no refactor of the factories themselves. Several layers
(greenery, parked cars, crops, car pickups) are on a fixed seed already and match across browsers
today. `weather` and `timeMode` ride the room code and are applied as the city loads.

Side benefit worth having regardless of multiplayer: the world becomes reproducible, which makes a
bug reported by screenshot re-creatable.

### The honest limit of the shared world

The seed makes the **initial** state match — where traffic, boats, benches, lamps and trains are
placed. It does not keep the worlds identical afterwards: bots step from their own frame timing and
are recycled around their own player, so the two worlds drift apart within a minute or two. That is
fine for driving together and is exactly why racing waits: "you hit a bot I don't have" would read
as a bug.

## UI

A **Multiplayer** screen inside `src/ui/menu.ts` — the menu rework replaced the floating-button
layout the original draft assumed. It holds: Host / Join, a name field (persisted through
`prefs.ts`), copy and paste buttons for the codes, and a connection-status line naming the
connected player. Players are **not** solid to each other — presence only.

## main.ts wiring

- Create the peer manager, `remotePlayers` and the menu screen.
- While connected, send the car's pose at ~18 Hz (not per frame) and feed received poses to
  `remotePlayers`; call `remotePlayers.update(dt)` from the loop.
- Joining loads the room's city through the existing `loadCity`, with the room's seed, weather and
  time mode applied.
- Tear `remotePlayers` down on city change and on disconnect.

## Testing

- Pure unit tests: `roomCode` round-trip and rejection of junk; `protocol` (de)serialisation; pose
  interpolation; the seeded world is deterministic given a seed.
- The **live WebRTC connection is verified by the user on two machines** — a headless run cannot
  pair two real peers. Remote-car rendering and neon coverage are visual checks too.
- `npx tsc --noEmit`, `npm test`, `npm run build`, `npm run boot-check` as always.

## Not in v1 (follow-ups)

- N players + auto-discovery. Needs something listening on the network: either a companion server
  (`npm run lan`) or signalling folded into the Vite dev server as a plugin. Both cost the
  zero-install property and only work from a local checkout, so both wait until presence has
  proven itself. Pairs with TODO #2 (Electron).
- Racing / taxi competition together — builds on presence plus the existing trial/rivals code, and
  needs the bot divergence answered.
- Players solid to each other (collision), chat, voice.
- QR codes for the exchange (nice with a phone; an SDP blob may not fit one code).

## Version

A minor bump when it lands. Given the live half is user-verified, it ships once the pure core is
green and a human has confirmed two browsers connect.

## What changed in the 2026-08-20 revision

- **fflate dropped.** The original said "fflate is already a dependency" — it is not; the only
  runtime dependency is `three`. `CompressionStream` replaces it, adding nothing to the tree.
- **UI placement.** "A 👥 button by ⚙" predates the menu rework; it is a screen in `menu.ts` now.
- **Seed / weather / time added** to the room payload, so the two worlds start out matching, with
  the drift limit stated rather than left to be discovered.
- **The mDNS/secure-context risk** is called out with a probe as the first implementation step.
- Transport was re-examined against a companion server and a Vite-plugin signaller, and the
  serverless copy-paste path was re-confirmed for v1.
