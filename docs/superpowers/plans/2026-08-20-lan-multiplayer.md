# LAN Multiplayer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two players on the same local network drive the same city and see each other's cars in real time, in a world that starts out identical on both screens.

**Architecture:** WebRTC peer-to-peer with no server anywhere: the host produces a *room code* (a compressed blob holding the city, the world seed, the weather, the time of day and its SDP offer), the guest pastes it and returns an *answer code*, the host pastes that back, and an unreliable DataChannel then carries poses at ~18 Hz. Both clients build their world from the shared seed, so traffic, boats and street furniture land in the same places. Each client stays authoritative over its own car; there are no collisions between players.

**Tech Stack:** TypeScript (strict), Three.js, Vite, Vitest. Browser built-ins only — `RTCPeerConnection` and `CompressionStream`. **No new npm dependency.**

**Spec:** `docs/superpowers/specs/2026-07-18-lan-multiplayer-design.md`

## Global Constraints

- **No new dependency.** The only runtime dependency stays `three`. Compression uses `CompressionStream('deflate-raw')`, present in browsers and Node 18+.
- **No backend, no server process.** Signalling is a copy-pasted code. Nothing in the repo may open a listening socket.
- **Layering.** `src/net/` must not import from `src/app/`, `src/world/` or Three.js. `src/app/remotePlayers.ts` may import `src/net/` and Three.js.
- **TypeScript strict**, plus `noUnusedLocals` / `noUnusedParameters` — prefix a deliberately unused parameter with `_`.
- **Neon coverage is mandatory.** Any new scene mesh must switch look in neon. A vehicle-shaped mover does this by setting `group.userData.neonMover = 'bot'` and calling `theme.refreshMovers()` after it is added — it is NOT part of `WorldRefs`.
- **Coordinate frame.** Ground plane is XZ, up is +Y. `Vec2 {x,z}` are local metres. A pose at `(x, z)` renders at `(x, heightAt(x,z), z)`.
- **i18n has no gaps.** `test/i18n/i18n.test.ts` asserts all ten languages (`en ru es de fr hy ka ja ko zh`) carry the exact same key set. Every new key must be added to all ten.
- **Before every commit:** `npx tsc --noEmit` and `npm test` must pass. Before the final commit also `npm run build` and, because `main.ts` is touched, `npm run boot-check`.
- **Branch:** `feat/lan-multiplayer` (already created, spec revision already committed on it).

---

### Task 1: Prove WebRTC actually connects across this LAN (throwaway probe)

Nothing else in this plan is worth building if two browsers on the user's network cannot open a DataChannel. Chrome hides local IPs behind mDNS `.local` candidate names, and `http://192.168.x.x` is not a secure context. This task answers both questions in one sitting. **The probe file is throwaway — it is never committed.**

**Files:**
- Create (scratchpad, NOT the repo): `<scratchpad>/webrtc-probe.html`

**Interfaces:**
- Consumes: nothing.
- Produces: a yes/no answer that gates Tasks 2-10. No code that later tasks import.

- [ ] **Step 1: Write the probe page**

Write to the session scratchpad directory (not the repo):

```html
<!doctype html>
<meta charset="utf-8" />
<title>WebRTC LAN probe</title>
<body style="font-family: system-ui; max-width: 40rem; margin: 2rem auto">
  <p>Secure context: <b id="sec"></b></p>
  <button id="host">Host</button> <button id="join">Join</button>
  <p><textarea id="out" rows="6" style="width:100%" placeholder="code to send"></textarea></p>
  <p><textarea id="in" rows="6" style="width:100%" placeholder="paste code here"></textarea></p>
  <button id="accept">Accept pasted code</button>
  <pre id="log"></pre>
  <script>
    const log = (m) => (document.getElementById('log').textContent += m + '\n')
    document.getElementById('sec').textContent = String(window.isSecureContext)
    const pc = new RTCPeerConnection() // no STUN: host candidates only, which is what a LAN needs
    let ch = null
    const wire = (c) => {
      ch = c
      c.onopen = () => log('CHANNEL OPEN')
      c.onmessage = (e) => log('recv: ' + e.data)
    }
    pc.onicecandidate = (e) => { if (!e.candidate) log('ice gathering complete') }
    pc.oniceconnectionstatechange = () => log('ice: ' + pc.iceConnectionState)
    pc.ondatachannel = (e) => wire(e.channel)
    const settled = () =>
      new Promise((r) => {
        if (pc.iceGatheringState === 'complete') return r()
        pc.addEventListener('icegatheringstatechange', () => pc.iceGatheringState === 'complete' && r())
      })
    const show = async () => {
      await settled()
      document.getElementById('out').value = JSON.stringify(pc.localDescription)
    }
    document.getElementById('host').onclick = async () => {
      wire(pc.createDataChannel('probe', { ordered: false, maxRetransmits: 0 }))
      await pc.setLocalDescription(await pc.createOffer())
      await show()
    }
    document.getElementById('join').onclick = () => log('paste the host code, then press Accept')
    document.getElementById('accept').onclick = async () => {
      const desc = JSON.parse(document.getElementById('in').value)
      await pc.setRemoteDescription(desc)
      if (desc.type === 'offer') {
        await pc.setLocalDescription(await pc.createAnswer())
        await show()
      }
      setInterval(() => ch && ch.readyState === 'open' && ch.send('ping ' + Math.round(performance.now())), 1000)
    }
  </script>
</body>
```

- [ ] **Step 2: Serve it over the LAN and run it on two machines**

Run from the scratchpad directory: `npx --yes serve -l 8099 .` (or any static server), then open `http://<host-lan-ip>:8099/webrtc-probe.html` on **both** machines.

Machine A: press **Host**, copy the top box. Machine B: paste into the bottom box, press **Accept**, copy its top box. Machine A: paste that, press **Accept**.

Expected: both logs show `CHANNEL OPEN` and a stream of `recv: ping …`.

- [ ] **Step 3: Record the verdict**

Three possible outcomes, and what each means:

- **Both show `CHANNEL OPEN`.** The approach works over plain LAN HTTP. Proceed to Task 2.
- **`Secure context: false` and `createDataChannel`/`createOffer` throws.** Plain HTTP is blocked. Re-run the probe over HTTPS — the simplest route is `npm run dev -- --host` with a self-signed cert, or push the probe to a scratch GitHub Pages branch. If it connects over HTTPS, proceed to Task 2 and note in the CHANGELOG that multiplayer needs the HTTPS build (which GitHub Pages is).
- **ICE reaches `failed` on both machines.** mDNS or client isolation is blocking peer-to-peer on this network. **STOP and report to the user** — the serverless design cannot work here, and the choice becomes a companion server (spec's follow-up list) or a different network. Do not build Tasks 2-10.

- [ ] **Step 4: Delete the probe**

Delete `<scratchpad>/webrtc-probe.html`. Nothing is committed by this task; `git status --short` must be clean apart from work from other tasks.

---

### Task 2: Room code encode/decode

**Files:**
- Create: `src/net/roomCode.ts`
- Test: `test/net/roomCode.test.ts`

**Interfaces:**
- Consumes: `WeatherSetting` from `src/app/weather.ts` is NOT imported (layering); the room stores a resolved `Weather`. Import `type Weather` from `../app/weather` is also forbidden — instead the room's weather field is typed as a string union declared locally and kept in sync by a test in Task 9. To keep this simple and still type-safe, declare the union in `src/net/roomCode.ts` itself:
  `export type RoomWeather = 'clear' | 'rain' | 'snow' | 'fog'` and `export type RoomTimeMode = 'cycle' | 'day' | 'night'`.
- Produces:
  - `export interface Room { v: 1; city: string; seed: number; weather: RoomWeather; timeMode: RoomTimeMode; time: number; sdp: string }`
  - `export async function encodeRoom(room: Room): Promise<string>`
  - `export async function decodeRoom(code: string): Promise<Room | null>`
  - `export type RoomWeather`, `export type RoomTimeMode`

Note on `weather`: the host resolves its **current** weather (never `'auto'`) so the two clients do not drift apart through auto-cycling, and sends `time` (the current day/night phase, 0..1) so both start the sky at the same point.

- [ ] **Step 1: Write the failing test**

Create `test/net/roomCode.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { encodeRoom, decodeRoom, type Room } from '../../src/net/roomCode'

const ROOM: Room = {
  v: 1,
  city: 'Paris',
  seed: 0x51c2beef,
  weather: 'rain',
  timeMode: 'cycle',
  time: 0.42,
  sdp: 'v=0\r\no=- 42 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\n',
}

describe('roomCode', () => {
  it('round-trips a room', async () => {
    const back = await decodeRoom(await encodeRoom(ROOM))
    expect(back).toEqual(ROOM)
  })

  it('produces a code that is URL-safe and free of padding', async () => {
    const code = await encodeRoom(ROOM)
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('compresses — an SDP repeats itself, so the code beats raw JSON', async () => {
    const big: Room = { ...ROOM, sdp: ROOM.sdp.repeat(30) }
    const code = await encodeRoom(big)
    expect(code.length).toBeLessThan(JSON.stringify(big).length)
  })

  it('rejects garbage rather than throwing', async () => {
    expect(await decodeRoom('')).toBeNull()
    expect(await decodeRoom('not base64 !!!')).toBeNull()
    expect(await decodeRoom('aGVsbG8')).toBeNull() // valid base64, not deflate
  })

  it('rejects a payload of the wrong version or shape', async () => {
    const wrongVersion = await encodeRoom({ ...ROOM, v: 2 as unknown as 1 })
    expect(await decodeRoom(wrongVersion)).toBeNull()
    const badWeather = await encodeRoom({ ...ROOM, weather: 'hail' as unknown as Room['weather'] })
    expect(await decodeRoom(badWeather)).toBeNull()
    const badSeed = await encodeRoom({ ...ROOM, seed: Number.NaN })
    expect(await decodeRoom(badSeed)).toBeNull()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run test/net/roomCode.test.ts`
Expected: FAIL — cannot resolve `src/net/roomCode`.

- [ ] **Step 3: Implement**

Create `src/net/roomCode.ts`:

```ts
/**
 * The room code: everything a guest needs to join, in one pasteable string.
 *
 * JSON → deflate-raw → base64url. `CompressionStream` is a browser built-in and
 * exists in Node 18+, so this needs no dependency and the unit tests exercise the
 * real codec. An SDP blob is very repetitive, so deflate roughly halves it.
 */

/** The weather the host is actually in — never 'auto', so the two skies can't drift apart. */
export type RoomWeather = 'clear' | 'rain' | 'snow' | 'fog'
export type RoomTimeMode = 'cycle' | 'day' | 'night'

const WEATHERS: readonly string[] = ['clear', 'rain', 'snow', 'fog']
const TIME_MODES: readonly string[] = ['cycle', 'day', 'night']

export interface Room {
  v: 1
  /** The host's city query — the guest loads exactly this. */
  city: string
  /** World seed: both clients scatter traffic, boats and furniture from it. */
  seed: number
  weather: RoomWeather
  timeMode: RoomTimeMode
  /** Day/night phase 0..1 at the moment the code was made. */
  time: number
  /** The SDP: the offer in a room code, the answer in an answer code. */
  sdp: string
}

async function pipe(bytes: Uint8Array, stream: TransformStream<Uint8Array, Uint8Array>): Promise<Uint8Array> {
  const written = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(written).arrayBuffer())
}

function toBase64Url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(code: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(code)) return null
  try {
    const s = atob(code.replace(/-/g, '+').replace(/_/g, '/'))
    const out = new Uint8Array(s.length)
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

export async function encodeRoom(room: Room): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(room))
  return toBase64Url(await pipe(raw, new CompressionStream('deflate-raw')))
}

/** Decode a pasted code. Returns null for anything that isn't a room of this version. */
export async function decodeRoom(code: string): Promise<Room | null> {
  const bytes = fromBase64Url(code.trim())
  if (!bytes || !bytes.length) return null
  let json: string
  try {
    json = new TextDecoder().decode(await pipe(bytes, new DecompressionStream('deflate-raw')))
  } catch {
    return null
  }
  let v: unknown
  try {
    v = JSON.parse(json)
  } catch {
    return null
  }
  const r = v as Partial<Room>
  if (!r || typeof r !== 'object') return null
  if (r.v !== 1) return null
  if (typeof r.city !== 'string' || !r.city) return null
  if (typeof r.seed !== 'number' || !Number.isFinite(r.seed)) return null
  if (typeof r.time !== 'number' || !Number.isFinite(r.time)) return null
  if (typeof r.sdp !== 'string' || !r.sdp) return null
  if (typeof r.weather !== 'string' || !WEATHERS.includes(r.weather)) return null
  if (typeof r.timeMode !== 'string' || !TIME_MODES.includes(r.timeMode)) return null
  return r as Room
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/net/roomCode.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Type-check and commit**

```bash
npx tsc --noEmit
npm test
git add src/net/roomCode.ts test/net/roomCode.test.ts
git commit -m "feat(net): room code — deflate-raw + base64url, validated on decode"
```

---

### Task 3: Wire protocol (hello + pose) and pose interpolation

**Files:**
- Create: `src/net/protocol.ts`
- Test: `test/net/protocol.test.ts`

**Interfaces:**
- Consumes: `VehicleType` from `src/vehicle/vehicles.ts` (allowed: `vehicle/` is below `app/` and holds no Three.js scene state — it is already imported by pure modules).
- Produces:
  - `export interface Pose { x: number; y: number; z: number; heading: number; speed: number; steer: number }`
  - `export interface Hello { t: 'hello'; name: string; vehicle: VehicleType }`
  - `export function encodePose(p: Pose): ArrayBuffer`
  - `export function decodePose(buf: ArrayBuffer): Pose | null`
  - `export function encodeHello(h: Hello): string`
  - `export function decodeHello(s: string): Hello | null`
  - `export function lerpPose(a: Pose, b: Pose, t: number): Pose`
  - `export const POSE_BYTES: number`

- [ ] **Step 1: Write the failing test**

Create `test/net/protocol.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  encodePose, decodePose, encodeHello, decodeHello, lerpPose, POSE_BYTES, type Pose,
} from '../../src/net/protocol'

const POSE: Pose = { x: 12.5, y: 3.25, z: -407.75, heading: 1.5, speed: 18.5, steer: -0.5 }

describe('protocol / pose', () => {
  it('round-trips a pose through the binary form', () => {
    const back = decodePose(encodePose(POSE))
    expect(back).toEqual(POSE) // every value above is exact in float32
  })

  it('is a fixed 24 bytes — six float32s', () => {
    expect(POSE_BYTES).toBe(24)
    expect(encodePose(POSE).byteLength).toBe(24)
  })

  it('rejects a buffer of the wrong size', () => {
    expect(decodePose(new ArrayBuffer(0))).toBeNull()
    expect(decodePose(new ArrayBuffer(23))).toBeNull()
    expect(decodePose(new ArrayBuffer(48))).toBeNull()
  })
})

describe('protocol / hello', () => {
  it('round-trips a hello', () => {
    expect(decodeHello(encodeHello({ t: 'hello', name: 'Костя', vehicle: 'sports' }))).toEqual({
      t: 'hello', name: 'Костя', vehicle: 'sports',
    })
  })

  it('rejects junk, a wrong tag, and an unknown vehicle', () => {
    expect(decodeHello('nonsense')).toBeNull()
    expect(decodeHello(JSON.stringify({ t: 'pose', name: 'A', vehicle: 'car' }))).toBeNull()
    expect(decodeHello(JSON.stringify({ t: 'hello', name: 'A', vehicle: 'spaceship' }))).toBeNull()
  })

  it('clamps an over-long name rather than rejecting it', () => {
    const long = 'x'.repeat(200)
    const back = decodeHello(encodeHello({ t: 'hello', name: long, vehicle: 'car' }))
    expect(back?.name.length).toBe(24)
  })
})

describe('protocol / lerpPose', () => {
  it('returns the ends at t=0 and t=1', () => {
    const b: Pose = { ...POSE, x: 100 }
    expect(lerpPose(POSE, b, 0)).toEqual(POSE)
    expect(lerpPose(POSE, b, 1)).toEqual(b)
  })

  it('interpolates position linearly', () => {
    const b: Pose = { ...POSE, x: POSE.x + 10, z: POSE.z + 4 }
    const mid = lerpPose(POSE, b, 0.5)
    expect(mid.x).toBeCloseTo(POSE.x + 5, 6)
    expect(mid.z).toBeCloseTo(POSE.z + 2, 6)
  })

  it('turns the short way round the wrap, not the long way', () => {
    // 350° → 10° must pass through 0°, i.e. +20°, never -340°.
    const a: Pose = { ...POSE, heading: (350 * Math.PI) / 180 }
    const b: Pose = { ...POSE, heading: (10 * Math.PI) / 180 }
    const mid = lerpPose(a, b, 0.5)
    const deg = ((mid.heading * 180) / Math.PI + 360) % 360
    expect(Math.min(deg, 360 - deg)).toBeLessThan(1e-6) // ≈ 0°/360°
  })

  it('clamps t outside 0..1', () => {
    const b: Pose = { ...POSE, x: POSE.x + 10 }
    expect(lerpPose(POSE, b, -1).x).toBe(POSE.x)
    expect(lerpPose(POSE, b, 5).x).toBe(b.x)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run test/net/protocol.test.ts`
Expected: FAIL — cannot resolve `src/net/protocol`.

- [ ] **Step 3: Implement**

Create `src/net/protocol.ts`:

```ts
import { VEHICLE_TYPES, type VehicleType } from '../vehicle/vehicles'

/**
 * What goes over the wire. Two messages, deliberately unlike each other:
 *
 * - `hello` is sent once, on open, and is JSON — it is rare and wants to be
 *   readable when something goes wrong.
 * - `pose` is the hot path at ~18 Hz and is a fixed 24-byte Float32Array. It
 *   rides an unreliable channel, so a lost or late pose is simply dropped; the
 *   next one supersedes it.
 */

export interface Pose {
  x: number
  y: number
  z: number
  /** Radians, the car's `heading` straight out of `CarState`. */
  heading: number
  /** Metres per second — drives the remote car's wheel spin. */
  speed: number
  /** −1..1 — drives the remote car's front-wheel angle. */
  steer: number
}

export interface Hello {
  t: 'hello'
  name: string
  vehicle: VehicleType
}

/** Six float32s. */
export const POSE_BYTES = 24
/** Longest player name we carry; longer is cut on receipt. */
export const NAME_MAX = 24

export function encodePose(p: Pose): ArrayBuffer {
  const a = new Float32Array([p.x, p.y, p.z, p.heading, p.speed, p.steer])
  return a.buffer
}

export function decodePose(buf: ArrayBuffer): Pose | null {
  if (buf.byteLength !== POSE_BYTES) return null
  const a = new Float32Array(buf)
  return { x: a[0], y: a[1], z: a[2], heading: a[3], speed: a[4], steer: a[5] }
}

export function encodeHello(h: Hello): string {
  return JSON.stringify(h)
}

export function decodeHello(s: string): Hello | null {
  let v: unknown
  try {
    v = JSON.parse(s)
  } catch {
    return null
  }
  const h = v as Partial<Hello>
  if (!h || typeof h !== 'object' || h.t !== 'hello') return null
  if (typeof h.name !== 'string') return null
  if (typeof h.vehicle !== 'string' || !VEHICLE_TYPES.includes(h.vehicle as VehicleType)) return null
  return { t: 'hello', name: h.name.slice(0, NAME_MAX), vehicle: h.vehicle as VehicleType }
}

/** Signed shortest way from `a` to `b` around the wrap, in radians. */
function shortest(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

/**
 * Blend two poses. Position and the scalars go linearly; heading takes the short
 * way round so a car crossing north doesn't spin 350° the wrong way.
 */
export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const k = t < 0 ? 0 : t > 1 ? 1 : t
  return {
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    z: a.z + (b.z - a.z) * k,
    heading: a.heading + shortest(a.heading, b.heading) * k,
    speed: a.speed + (b.speed - a.speed) * k,
    steer: a.steer + (b.steer - a.steer) * k,
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/net/protocol.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Type-check and commit**

```bash
npx tsc --noEmit
npm test
git add src/net/protocol.ts test/net/protocol.test.ts
git commit -m "feat(net): wire protocol — binary pose, JSON hello, short-way heading lerp"
```

---

### Task 4: The peer (WebRTC wrapper)

This is the one module that cannot be meaningfully unit-tested — it is a thin shell over `RTCPeerConnection`, and a fake would only test the fake. Keep it thin on purpose: every decision that *can* live in `roomCode`/`protocol` already does. It is verified live in Task 10.

**Files:**
- Create: `src/net/peer.ts`

**Interfaces:**
- Consumes: `Room`, `encodeRoom`, `decodeRoom` from `./roomCode`; `Pose`, `Hello`, `encodePose`, `decodePose`, `encodeHello`, `decodeHello` from `./protocol`.
- Produces:
  - `export type PeerState = 'idle' | 'waiting' | 'connecting' | 'connected' | 'closed' | 'failed'`
  - `export interface Peer { state(): PeerState; onState(cb: (s: PeerState) => void): void; onHello(cb: (h: Hello) => void): void; onPose(cb: (p: Pose) => void): void; sendHello(h: Hello): void; sendPose(p: Pose): void; close(): void }`
  - `export interface HostSession extends Peer { code: string; acceptAnswer(code: string): Promise<boolean> }`
  - `export interface GuestSession extends Peer { room: Room; answerCode: string }`
  - `export async function hostRoom(room: Omit<Room, 'sdp'>): Promise<HostSession>`
  - `export async function joinRoom(code: string): Promise<GuestSession | null>`

- [ ] **Step 1: Implement**

Create `src/net/peer.ts`:

```ts
import { decodeRoom, encodeRoom, type Room } from './roomCode'
import {
  decodeHello, decodePose, encodeHello, encodePose, type Hello, type Pose,
} from './protocol'

/**
 * The WebRTC half of LAN multiplayer — deliberately thin.
 *
 * No STUN and no TURN: on a LAN the only candidates that matter are host
 * candidates, and they gather in milliseconds. So instead of trickling we wait
 * for gathering to complete and ship the whole description in one blob, which is
 * what makes a single copy-pasted code enough.
 */

export type PeerState = 'idle' | 'waiting' | 'connecting' | 'connected' | 'closed' | 'failed'

export interface Peer {
  state(): PeerState
  onState(cb: (s: PeerState) => void): void
  onHello(cb: (h: Hello) => void): void
  onPose(cb: (p: Pose) => void): void
  sendHello(h: Hello): void
  sendPose(p: Pose): void
  close(): void
}

export interface HostSession extends Peer {
  /** The room code to hand to the guest. */
  code: string
  /** Feed back the guest's answer code. False if it wasn't a valid one. */
  acceptAnswer(code: string): Promise<boolean>
}

export interface GuestSession extends Peer {
  /** What the host wants built: city, seed, weather, time. */
  room: Room
  /** The code to send back to the host. */
  answerCode: string
}

/** Resolves once ICE has gathered everything, so `localDescription` is complete. */
function gathered(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((resolve) => {
    const check = (): void => {
      if (pc.iceGatheringState !== 'complete') return
      pc.removeEventListener('icegatheringstatechange', check)
      resolve()
    }
    pc.addEventListener('icegatheringstatechange', check)
  })
}

interface Core extends Peer {
  pc: RTCPeerConnection
  attach(ch: RTCDataChannel): void
}

function core(pc: RTCPeerConnection): Core {
  let state: PeerState = 'idle'
  let channel: RTCDataChannel | null = null
  let onStateCb: ((s: PeerState) => void) | null = null
  let onHelloCb: ((h: Hello) => void) | null = null
  let onPoseCb: ((p: Pose) => void) | null = null

  const set = (s: PeerState): void => {
    if (s === state) return
    state = s
    onStateCb?.(s)
  }

  pc.addEventListener('connectionstatechange', () => {
    if (pc.connectionState === 'failed') set('failed')
    else if (pc.connectionState === 'closed' || pc.connectionState === 'disconnected') set('closed')
  })

  const attach = (ch: RTCDataChannel): void => {
    channel = ch
    ch.binaryType = 'arraybuffer'
    ch.onopen = () => set('connected')
    ch.onclose = () => set('closed')
    ch.onerror = () => set('failed')
    ch.onmessage = (e: MessageEvent) => {
      if (typeof e.data === 'string') {
        const h = decodeHello(e.data)
        if (h) onHelloCb?.(h)
        return
      }
      const p = decodePose(e.data as ArrayBuffer)
      if (p) onPoseCb?.(p)
    }
  }

  const live = (): boolean => channel?.readyState === 'open'

  return {
    pc,
    attach,
    state: () => state,
    onState: (cb) => {
      onStateCb = cb
      cb(state)
    },
    onHello: (cb) => {
      onHelloCb = cb
    },
    onPose: (cb) => {
      onPoseCb = cb
    },
    sendHello: (h) => {
      if (live()) channel?.send(encodeHello(h))
    },
    sendPose: (p) => {
      if (live()) channel?.send(encodePose(p))
    },
    close: () => {
      channel?.close()
      pc.close()
      set('closed')
    },
  }
}

/** The unreliable pose channel: a stale pose is dropped, never queued behind a newer one. */
const CHANNEL_OPTS: RTCDataChannelInit = { ordered: false, maxRetransmits: 0 }

export async function hostRoom(room: Omit<Room, 'sdp'>): Promise<HostSession> {
  const pc = new RTCPeerConnection()
  const c = core(pc)
  c.attach(pc.createDataChannel('rtc-pose', CHANNEL_OPTS))
  await pc.setLocalDescription(await pc.createOffer())
  await gathered(pc)
  const code = await encodeRoom({ ...room, sdp: pc.localDescription?.sdp ?? '' })
  return {
    ...c,
    code,
    acceptAnswer: async (answer: string): Promise<boolean> => {
      const back = await decodeRoom(answer)
      if (!back) return false
      await pc.setRemoteDescription({ type: 'answer', sdp: back.sdp })
      return true
    },
  }
}

export async function joinRoom(code: string): Promise<GuestSession | null> {
  const room = await decodeRoom(code)
  if (!room) return null
  const pc = new RTCPeerConnection()
  const c = core(pc)
  pc.addEventListener('datachannel', (e: RTCDataChannelEvent) => c.attach(e.channel))
  await pc.setRemoteDescription({ type: 'offer', sdp: room.sdp })
  await pc.setLocalDescription(await pc.createAnswer())
  await gathered(pc)
  const answerCode = await encodeRoom({ ...room, sdp: pc.localDescription?.sdp ?? '' })
  return { ...c, room, answerCode }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no output. If `RTCDataChannelEvent` is missing, the DOM lib is already on (`tsconfig.json` includes `"DOM"`), so a failure here means a real typo — fix it rather than casting to `any`.

- [ ] **Step 3: Run the suite and commit**

```bash
npm test
git add src/net/peer.ts
git commit -m "feat(net): WebRTC peer — gather-complete signalling, unreliable pose channel"
```

---

### Task 5: Seeded world streams

Both clients must scatter traffic, boats, trains and street furniture the same way. Every factory in `main.ts` already takes `rand` as a parameter, so this is a call-site change — but a *single* shared generator would desync the moment the two players run different density or quality settings, because a different draw count shifts every later layer. Give each layer its own stream instead.

**Files:**
- Create: `src/app/worldSeed.ts`
- Test: `test/app/worldSeed.test.ts`
- Modify: `src/app/main.ts` (the ~20 `Math.random` arguments passed to world factories)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export function mulberry32(seed: number): () => number`
  - `export function randomSeed(): number`
  - `export function stream(seed: number, name: string): () => number`

- [ ] **Step 1: Write the failing test**

Create `test/app/worldSeed.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mulberry32, randomSeed, stream } from '../../src/app/worldSeed'

const take = (rand: () => number, n = 8): number[] => Array.from({ length: n }, () => rand())

describe('worldSeed', () => {
  it('mulberry32 is deterministic and stays in [0,1)', () => {
    expect(take(mulberry32(1234))).toEqual(take(mulberry32(1234)))
    for (const v of take(mulberry32(99), 200)) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('gives the same layer the same sequence on both clients', () => {
    expect(take(stream(0xc0ffee, 'traffic'))).toEqual(take(stream(0xc0ffee, 'traffic')))
  })

  it('gives different layers different sequences', () => {
    expect(take(stream(0xc0ffee, 'traffic'))).not.toEqual(take(stream(0xc0ffee, 'boats')))
  })

  it('gives different seeds different sequences', () => {
    expect(take(stream(1, 'traffic'))).not.toEqual(take(stream(2, 'traffic')))
  })

  it('is independent of how much any other layer drew — the desync guard', () => {
    // One client burns 500 draws of traffic (denser setting); boats must not shift.
    const a = stream(7, 'traffic')
    for (let i = 0; i < 500; i++) a()
    expect(take(stream(7, 'boats'))).toEqual(take(stream(7, 'boats')))
  })

  it('randomSeed returns a 32-bit unsigned integer', () => {
    for (let i = 0; i < 50; i++) {
      const s = randomSeed()
      expect(Number.isInteger(s)).toBe(true)
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(0xffffffff)
    }
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run test/app/worldSeed.test.ts`
Expected: FAIL — cannot resolve `src/app/worldSeed`.

- [ ] **Step 3: Implement**

Create `src/app/worldSeed.ts`:

```ts
/**
 * The world seed: what makes two players' cities match.
 *
 * Every world factory in `main.ts` already takes a `rand` parameter, so sharing a
 * world is a matter of handing them a seeded generator instead of `Math.random`.
 * The catch is that a single shared generator couples the layers: if one player
 * runs a denser traffic setting, that layer draws more numbers and every layer
 * after it shifts. So each layer gets its OWN stream, derived from the seed and
 * the layer's name — draw counts in one can never move another.
 */

/** Deterministic PRNG — the same one `greenery`, `boats`, `crops` and `carPickups` use. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** FNV-1a over the layer name, mixed with the seed. */
function derive(seed: number, name: string): number {
  let h = (0x811c9dc5 ^ seed) >>> 0
  for (let i = 0; i < name.length; i++) {
    h = (h ^ name.charCodeAt(i)) >>> 0
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** A generator for one world layer — independent of every other layer's draws. */
export function stream(seed: number, name: string): () => number {
  return mulberry32(derive(seed, name))
}

/** A fresh seed for a solo session. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0x100000000) >>> 0
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/app/worldSeed.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Wire the seed through main.ts**

In `src/app/main.ts`, add the import and the session seed near the other module-scope state (put it beside the other `const` declarations at the top, NOT inside a function — but read the temporal-dead-zone note in `AGENTS.md` before moving anything else):

```ts
import { randomSeed, stream } from './worldSeed'

/**
 * This session's world seed. A fresh random one when playing alone; replaced by
 * the host's seed when joining a LAN room, so both players get the same scatter.
 */
let worldSeed = randomSeed()
/** A per-layer generator. Layers are independent so a density difference can't desync them. */
const rnd = (layer: string): (() => number) => stream(worldSeed, layer)
/** Set before a city loads when joining a room. */
export function setWorldSeed(seed: number): void {
  worldSeed = seed
}
```

Then replace the `Math.random` argument at each world-factory call site with `rnd('<layer>')`, using one stable layer name per factory. Both the initial build and the density/quality rebuild path must use the SAME name for the same factory:

| Call | Replace `Math.random` with |
|---|---|
| `watersideBenchSpots(...)` | `rnd('watersideBenches')` |
| `buildStreetFurniture(...)` | `rnd('streetFurniture')` |
| `buildInfill(...)` | `rnd('infill')` |
| `createTrains(...)` (both sites) | `rnd('trains')` |
| `createTrafficLights(...)` (both sites) | `rnd('trafficLights')` |
| `createTraffic(...)` (both sites) | `rnd('traffic')` |
| `createPedestrians(...)` (both sites) | `rnd('pedestrians')` |
| `createBoats(...)` (both sites) | `rnd('boats')` |
| `createLivingParking(...)` (both sites) | `rnd('livingParking')` |
| `createBuses(...)` (both sites) | `rnd('buses')` |
| `createMotorcycles(...)` (both sites) | `rnd('motorcycles')` |
| `createCyclists(...)` (both sites) | `rnd('cyclists')` |
| `createAircraft(...)` | `rnd('aircraft')` |
| `createBirds(...)` | `rnd('birds')` |

Leave `makeFireworkTimer(Math.random)` on `Math.random` — fireworks are a holiday decoration, not world layout, and pinning them buys nothing.

Verify none were missed among the world builders:

```bash
grep -n "Math.random" src/app/main.ts
```
Expected: only the `makeFireworkTimer` line remains.

- [ ] **Step 6: Verify nothing broke**

```bash
npx tsc --noEmit
npm test
npm run build
npm run boot-check
```
Expected: all four succeed. `boot-check` matters here — `main.ts` changed.

- [ ] **Step 7: Commit**

```bash
git add src/app/worldSeed.ts test/app/worldSeed.test.ts src/app/main.ts
git commit -m "feat(app): seed the world per layer, so two clients can scatter it identically"
```

---

### Task 6: Render remote players

**Files:**
- Create: `src/app/remotePlayers.ts`
- Test: `test/app/remotePlayers.test.ts`

**Interfaces:**
- Consumes: `Pose`, `lerpPose` from `src/net/protocol`; `buildVehicleMesh` from `src/vehicle/model`; `VehicleType` from `src/vehicle/vehicles`; `ElevationProvider` from `src/terrain/provider`; `groundQuat` from `src/terrain/slope`.
- Produces:
  - `export interface RemotePlayers { setProvider(p: ElevationProvider): void; join(id: string, name: string, vehicle: VehicleType): void; pose(id: string, p: Pose): void; leave(id: string): void; update(dt: number): void; count(): number; dispose(): void }`
  - `export function createRemotePlayers(scene: THREE.Scene): RemotePlayers`
  - `export const SMOOTH: number`

- [ ] **Step 1: Write the failing test**

`buildVehicleMesh` builds real Three.js geometry, which works fine under Vitest (other tests in `test/app/` already do this). The test drives the public surface — join, pose, update, leave — and asserts on the scene graph.

Create `test/app/remotePlayers.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createRemotePlayers, SMOOTH } from '../../src/app/remotePlayers'
import type { Pose } from '../../src/net/protocol'

const pose = (x: number, z: number, heading = 0): Pose => ({ x, y: 0, z, heading, speed: 0, steer: 0 })

describe('remotePlayers', () => {
  it('adds a car to the scene on join and removes it on leave', () => {
    const scene = new THREE.Scene()
    const rp = createRemotePlayers(scene)
    expect(rp.count()).toBe(0)
    rp.join('a', 'Kostya', 'sports')
    expect(rp.count()).toBe(1)
    expect(scene.children.length).toBe(1)
    rp.leave('a')
    expect(rp.count()).toBe(0)
    expect(scene.children.length).toBe(0)
  })

  it('flags each remote car for neon so the theme flips it', () => {
    const scene = new THREE.Scene()
    const rp = createRemotePlayers(scene)
    rp.join('a', 'Kostya', 'car')
    expect(scene.children[0].userData.neonMover).toBe('bot')
  })

  it('ignores a pose for someone who never joined', () => {
    const scene = new THREE.Scene()
    const rp = createRemotePlayers(scene)
    rp.pose('ghost', pose(10, 10))
    rp.update(0.1)
    expect(rp.count()).toBe(0)
  })

  it('snaps to the first pose rather than sliding in from the origin', () => {
    const scene = new THREE.Scene()
    const rp = createRemotePlayers(scene)
    rp.join('a', 'Kostya', 'car')
    rp.pose('a', pose(120, -40))
    rp.update(0.016)
    const car = scene.children[0]
    expect(car.position.x).toBeCloseTo(120, 3)
    expect(car.position.z).toBeCloseTo(-40, 3)
  })

  it('eases toward a new pose instead of teleporting', () => {
    const scene = new THREE.Scene()
    const rp = createRemotePlayers(scene)
    rp.join('a', 'Kostya', 'car')
    rp.pose('a', pose(0, 0))
    rp.update(0.016)
    rp.pose('a', pose(100, 0))
    rp.update(SMOOTH / 2) // half way through the blend window
    const x = scene.children[0].position.x
    expect(x).toBeGreaterThan(20)
    expect(x).toBeLessThan(80)
    rp.update(SMOOTH) // past the end of the window
    expect(scene.children[0].position.x).toBeCloseTo(100, 3)
  })

  it('sits the car on the terrain the provider reports', () => {
    const scene = new THREE.Scene()
    const rp = createRemotePlayers(scene)
    rp.setProvider({ heightAt: () => 12 })
    rp.join('a', 'Kostya', 'car')
    rp.pose('a', { ...pose(5, 5), y: 0 })
    rp.update(0.016)
    expect(scene.children[0].position.y).toBeGreaterThan(11)
  })

  it('drops everything on dispose', () => {
    const scene = new THREE.Scene()
    const rp = createRemotePlayers(scene)
    rp.join('a', 'A', 'car')
    rp.join('b', 'B', 'ev')
    rp.dispose()
    expect(rp.count()).toBe(0)
    expect(scene.children.length).toBe(0)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run test/app/remotePlayers.test.ts`
Expected: FAIL — cannot resolve `src/app/remotePlayers`.

- [ ] **Step 3: Implement**

Create `src/app/remotePlayers.ts`:

```ts
import * as THREE from 'three'
import { lerpPose, type Pose } from '../net/protocol'
import type { ElevationProvider } from '../terrain/provider'
import { groundQuat } from '../terrain/slope'
import { buildVehicleMesh } from '../vehicle/model'
import type { VehicleType } from '../vehicle/vehicles'

/**
 * The other players' cars.
 *
 * A remote car is NOT simulated — it is a mesh replaying a pose feed. Poses
 * arrive about 18 times a second over an unreliable channel, so the mesh eases
 * from where it is toward the newest pose over {@link SMOOTH} rather than
 * stepping, which hides both the low rate and the odd dropped packet.
 *
 * Height comes from the local `ElevationProvider`, not from the wire: both
 * clients build the same terrain, and reading it locally keeps a car glued to
 * the ground even when its pose is a frame or two stale. The pose's own `y` is
 * used while the sender is airborne (it will be above the terrain then).
 */

/** Seconds to blend from the old pose to a newly arrived one. */
export const SMOOTH = 0.09
/** Height of the name label over the car's roof, in metres. */
const LABEL_Y = 3.1

export interface RemotePlayers {
  /** The city's terrain — replaced wholesale when a city loads. */
  setProvider(p: ElevationProvider): void
  join(id: string, name: string, vehicle: VehicleType): void
  pose(id: string, p: Pose): void
  leave(id: string): void
  update(dt: number): void
  count(): number
  dispose(): void
}

interface Remote {
  group: THREE.Group
  label: THREE.Sprite
  /** Where the mesh is now, and where it is heading. */
  from: Pose
  to: Pose
  /** How far through the blend, 0..1. */
  t: number
  /** No pose has arrived yet — the first one snaps instead of sliding in. */
  fresh: boolean
}

/** A name plate: white text on a soft dark plaque, readable in day and neon alike. */
function makeLabel(name: string): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(0, 0, 256, 64)
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 34px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(name, 128, 34, 240)
  }
  const tex = new THREE.CanvasTexture(canvas)
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }))
  sprite.scale.set(4, 1, 1)
  sprite.position.y = LABEL_Y
  return sprite
}

function disposeTree(o: THREE.Object3D): void {
  o.traverse((n) => {
    const mesh = n as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
    const m = mesh.material
    if (m) for (const mat of Array.isArray(m) ? m : [m]) mat.dispose()
    const sprite = n as THREE.Sprite
    if (sprite.isSprite) sprite.material.map?.dispose()
  })
}

export function createRemotePlayers(scene: THREE.Scene): RemotePlayers {
  const remotes = new Map<string, Remote>()
  let provider: ElevationProvider = { heightAt: () => 0 }

  const leave = (id: string): void => {
    const r = remotes.get(id)
    if (!r) return
    scene.remove(r.group)
    disposeTree(r.group)
    remotes.delete(id)
  }

  return {
    setProvider: (p) => {
      provider = p
    },

    join: (id, name, vehicle) => {
      leave(id) // a re-join replaces the old car rather than stacking a second one
      const group = new THREE.Group()
      group.add(buildVehicleMesh(vehicle))
      const label = makeLabel(name)
      group.add(label)
      // Not part of WorldRefs: movers are found by this flag on every neon toggle.
      group.userData.neonMover = 'bot'
      group.visible = false // stays hidden until the first pose says where it is
      scene.add(group)
      const zero: Pose = { x: 0, y: 0, z: 0, heading: 0, speed: 0, steer: 0 }
      remotes.set(id, { group, label, from: zero, to: zero, t: 1, fresh: true })
    },

    pose: (id, p) => {
      const r = remotes.get(id)
      if (!r) return
      r.from = r.fresh ? p : lerpPose(r.from, r.to, r.t)
      r.to = p
      r.t = 0
      if (r.fresh) {
        r.fresh = false
        r.group.visible = true
      }
    },

    update: (dt) => {
      for (const r of remotes.values()) {
        if (r.fresh) continue
        r.t = Math.min(1, r.t + dt / SMOOTH)
        const p = lerpPose(r.from, r.to, r.t)
        const ground = provider.heightAt(p.x, p.z)
        r.group.position.set(p.x, Math.max(ground, p.y), p.z)
        r.group.quaternion.copy(groundQuat(provider, p.x, p.z, p.heading))
      }
    },

    leave,
    count: () => remotes.size,

    dispose: () => {
      for (const id of [...remotes.keys()]) leave(id)
    },
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/app/remotePlayers.test.ts`
Expected: PASS, 7 tests.

If `groundQuat`'s signature differs from `(provider, x, z, heading)`, check it in `src/terrain/slope.ts` and match the call to the real one — `rivals.ts` and `traffic.ts` both call it and are the reference.

- [ ] **Step 5: Type-check and commit**

```bash
npx tsc --noEmit
npm test
git add src/app/remotePlayers.ts test/app/remotePlayers.test.ts
git commit -m "feat(app): render remote players — eased pose replay, terrain-glued, neon-flagged"
```

---

### Task 7: The player name preference and the UI strings

**Files:**
- Modify: `src/app/prefs.ts` (append, following the existing getter/setter pattern)
- Modify: `src/i18n/i18n.ts` (sixteen keys × ten languages)
- Test: `test/app/prefs.test.ts` if it exists — otherwise the i18n suite covers this task's risk

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export function getPlayerName(): string`
  - `export function setPlayerName(name: string): void`
  - i18n keys `mp.*` listed below.

- [ ] **Step 1: Add the preference**

Append to `src/app/prefs.ts`, matching the try/catch shape every other pref uses:

```ts
const NAME_KEY = 'rtc.playerName'

/** The name shown over this player's car to everyone else in a LAN room. */
export function getPlayerName(): string {
  try {
    const n = localStorage.getItem(NAME_KEY)
    if (n && n.trim()) return n.trim().slice(0, 24)
  } catch {
    /* ignore */
  }
  return 'Player'
}

export function setPlayerName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name.trim().slice(0, 24))
  } catch {
    /* ignore */
  }
}
```

- [ ] **Step 2: Add the strings to all ten languages**

`test/i18n/i18n.test.ts` fails if any language is missing a key, so add all sixteen to every one of the ten dictionaries in `src/i18n/i18n.ts`. Place them next to the other menu keys in each dictionary.

```
key                    en                          ru
mp.title               Multiplayer                 Сетевая игра
mp.name                Your name                   Твоё имя
mp.host                Host a game                 Создать игру
mp.join                Join a game                 Присоединиться
mp.roomCode            Room code                   Код комнаты
mp.answerCode          Answer code                 Код ответа
mp.copy                Copy                        Копировать
mp.paste               Paste                       Вставить
mp.connect             Connect                     Подключиться
mp.disconnect          Disconnect                  Отключиться
mp.status.idle         Not connected               Нет соединения
mp.status.waiting      Waiting for the answer…     Жду код ответа…
mp.status.connecting   Connecting…                 Подключаюсь…
mp.status.connected    Connected                   На связи
mp.status.failed       Could not connect           Не удалось подключиться
mp.hint                Same network only. Send your code to a friend and paste theirs back.
                       Только одна сеть. Отправь свой код другу и вставь его ответ.
```

```
key                    es                            de
mp.title               Multijugador                  Mehrspieler
mp.name                Tu nombre                     Dein Name
mp.host                Crear partida                 Spiel hosten
mp.join                Unirse                        Beitreten
mp.roomCode            Código de sala                Raumcode
mp.answerCode          Código de respuesta           Antwortcode
mp.copy                Copiar                        Kopieren
mp.paste               Pegar                         Einfügen
mp.connect             Conectar                      Verbinden
mp.disconnect          Desconectar                   Trennen
mp.status.idle         Sin conexión                  Nicht verbunden
mp.status.waiting      Esperando la respuesta…       Warte auf den Antwortcode…
mp.status.connecting   Conectando…                   Verbinde…
mp.status.connected    Conectado                     Verbunden
mp.status.failed       No se pudo conectar           Verbindung fehlgeschlagen
mp.hint                Solo la misma red. Envía tu código a un amigo y pega el suyo.
                       Nur im selben Netz. Schicke deinen Code und füge den anderen ein.
```

```
key                    fr                              hy
mp.title               Multijoueur                     Ցանցային խաղ
mp.name                Ton nom                         Քո անունը
mp.host                Créer une partie                Ստեղծել խաղ
mp.join                Rejoindre                       Միանալ
mp.roomCode            Code du salon                   Սենյակի կոդ
mp.answerCode          Code de réponse                 Պատասխանի կոդ
mp.copy                Copier                          Պատճենել
mp.paste               Coller                          Տեղադրել
mp.connect             Se connecter                    Միանալ
mp.disconnect          Se déconnecter                  Անջատվել
mp.status.idle         Non connecté                    Կապ չկա
mp.status.waiting      En attente de la réponse…       Սպասում եմ պատասխանի կոդին…
mp.status.connecting   Connexion…                      Միանում եմ…
mp.status.connected    Connecté                        Կապակցված է
mp.status.failed       Échec de la connexion           Չհաջողվեց միանալ
mp.hint                Même réseau uniquement. Envoie ton code et colle celui de ton ami.
                       Միայն նույն ցանցում։ Ուղարկիր քո կոդը և տեղադրիր ընկերոջինը։
```

```
key                    ka                                ja
mp.title               ქსელური თამაში                    マルチプレイ
mp.name                შენი სახელი                       あなたの名前
mp.host                თამაშის შექმნა                    ホストする
mp.join                შეერთება                          参加する
mp.roomCode            ოთახის კოდი                       ルームコード
mp.answerCode          პასუხის კოდი                      応答コード
mp.copy                კოპირება                          コピー
mp.paste               ჩასმა                             貼り付け
mp.connect             დაკავშირება                       接続
mp.disconnect          გათიშვა                           切断
mp.status.idle         კავშირი არ არის                   未接続
mp.status.waiting      ველოდები პასუხის კოდს…            応答コードを待っています…
mp.status.connecting   ვუკავშირდები…                     接続中…
mp.status.connected    დაკავშირებულია                    接続済み
mp.status.failed       დაკავშირება ვერ მოხერხდა          接続できませんでした
mp.hint                მხოლოდ ერთ ქსელში. გაუგზავნე შენი კოდი მეგობარს და ჩასვი მისი.
                       同じネットワークのみ。コードを友達に送り、相手のコードを貼り付けてください。
```

```
key                    ko                                zh
mp.title               멀티플레이                          联机游戏
mp.name                내 이름                             你的名字
mp.host                방 만들기                           创建房间
mp.join                참가하기                            加入房间
mp.roomCode            방 코드                             房间码
mp.answerCode          응답 코드                           应答码
mp.copy                복사                                复制
mp.paste               붙여넣기                            粘贴
mp.connect             연결                                连接
mp.disconnect          연결 끊기                           断开
mp.status.idle         연결되지 않음                       未连接
mp.status.waiting      응답 코드를 기다리는 중…            正在等待应答码…
mp.status.connecting   연결 중…                            正在连接…
mp.status.connected    연결됨                              已连接
mp.status.failed       연결하지 못했습니다                 无法连接
mp.hint                같은 네트워크에서만 됩니다. 코드를 친구에게 보내고 친구의 코드를 붙여넣으세요.
                       仅限同一网络。把你的房间码发给朋友，再粘贴对方的应答码。
```

- [ ] **Step 3: Verify no language has a gap**

Run: `npx vitest run test/i18n/i18n.test.ts`
Expected: PASS — in particular "ships every language with the exact same set of keys". A failure here names the language and key you missed.

- [ ] **Step 4: Type-check and commit**

```bash
npx tsc --noEmit
npm test
git add src/app/prefs.ts src/i18n/i18n.ts
git commit -m "feat(i18n): multiplayer strings in all ten languages + a persisted player name"
```

---

### Task 8: The Multiplayer screen in the menu

**Files:**
- Modify: `src/ui/menu.ts` (a fourth screen alongside `main`, `options`, `about`)

**Interfaces:**
- Consumes: `t` from `src/i18n/i18n`; `getPlayerName`, `setPlayerName` from `src/app/prefs`; the `PeerState` type from `src/net/peer`.
- Produces, added to the existing interfaces in `menu.ts`:
  - On `MenuCallbacks`: `onHostRoom: () => void`, `onJoinRoom: (code: string) => void`, `onAcceptAnswer: (code: string) => void`, `onLeaveRoom: () => void`, `onPlayerName: (name: string) => void`
  - On `MenuHandle`: `setNetState(state: PeerState, peerName: string | null): void`, `setRoomCode(code: string): void`, `setAnswerCode(code: string): void`

The screen never touches `RTCPeerConnection` itself — it hands codes to `main.ts` and renders what it is told. That keeps the UI testable by eye and the networking in one place.

- [ ] **Step 1: Declare the callbacks and handle methods**

In `src/ui/menu.ts`, add to `MenuCallbacks` (after `onResetLocation`):

```ts
  // --- Multiplayer screen ---
  /** Start hosting: main.ts builds a room code and feeds it back via setRoomCode. */
  onHostRoom: () => void
  /** A pasted room code — main.ts joins and feeds the answer back via setAnswerCode. */
  onJoinRoom: (code: string) => void
  /** The host pasting the guest's answer code. */
  onAcceptAnswer: (code: string) => void
  /** Hang up. */
  onLeaveRoom: () => void
  /** The player renamed themselves. */
  onPlayerName: (name: string) => void
```

And to `MenuHandle`:

```ts
  /** Reflect the live connection state, naming the peer once one has said hello. */
  setNetState(state: PeerState, peerName: string | null): void
  /** Show the room code the host must send. */
  setRoomCode(code: string): void
  /** Show the answer code the guest must send back. */
  setAnswerCode(code: string): void
```

Import the type at the top: `import type { PeerState } from '../net/peer'`.

- [ ] **Step 2: Build the screen**

Add a fourth screen next to the existing three. Where `mainScreen`, `optionsScreen` and `aboutScreen` are created and appended to `panel`, add:

```ts
  const mpScreen = document.createElement('div')
  mpScreen.dataset.screen = 'mp'
  mpScreen.style.cssText = 'display:none;flex-direction:column;gap:8px;max-height:calc(100vh - 150px);overflow-y:auto;'
```

and include `mpScreen` in the `panel.append(...)` call. Then build its contents, following the styling the Options screen already uses for its back row and labels:

```ts
  //  MULTIPLAYER screen — codes in, codes out; the networking lives in main.ts
  const mpBackRow = document.createElement('div')
  const mpBackBtn = document.createElement('button')
  mpBackBtn.textContent = '←'
  mpBackBtn.addEventListener('click', () => showMain())
  const mpTitle = document.createElement('div')
  mpBackRow.append(mpBackBtn, mpTitle)
  mpScreen.appendChild(mpBackRow)

  const mpHint = document.createElement('div')
  mpHint.style.cssText = 'font-size:12px;opacity:0.75;line-height:1.4;'

  const nameInput = document.createElement('input')
  nameInput.maxLength = 24
  nameInput.value = getPlayerName()
  nameInput.addEventListener('change', () => {
    const n = nameInput.value.trim() || 'Player'
    nameInput.value = n
    setPlayerName(n)
    cb.onPlayerName(n)
  })

  const hostBtn = document.createElement('button')
  const joinBtn = document.createElement('button')
  const leaveBtn = document.createElement('button')

  /** One code box: a read-only-ish textarea plus Copy and Paste. */
  function codeBox(): { wrap: HTMLDivElement; label: HTMLDivElement; area: HTMLTextAreaElement } {
    const wrap = document.createElement('div')
    wrap.style.cssText = 'display:none;flex-direction:column;gap:4px;'
    const label = document.createElement('div')
    label.style.cssText = 'font-size:12px;opacity:0.75;'
    const area = document.createElement('textarea')
    area.rows = 3
    area.style.cssText = 'width:100%;font-family:monospace;font-size:11px;word-break:break-all;'
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;gap:6px;'
    const copy = document.createElement('button')
    copy.textContent = t('mp.copy')
    copy.addEventListener('click', () => {
      area.select()
      void navigator.clipboard?.writeText(area.value)
    })
    const paste = document.createElement('button')
    paste.textContent = t('mp.paste')
    paste.addEventListener('click', async () => {
      const text = await navigator.clipboard?.readText()
      if (text) area.value = text.trim()
    })
    row.append(copy, paste)
    wrap.append(label, area, row)
    return { wrap, label, area }
  }

  const mine = codeBox() // the code this client produces and sends
  const theirs = codeBox() // the code pasted in from the other side
  const goBtn = document.createElement('button')
  const mpStatus = document.createElement('div')
  mpStatus.style.cssText = 'font-size:13px;padding-top:4px;'

  /** 'idle' before a choice, then which side of the exchange this client is on. */
  let mpRole: 'idle' | 'host' | 'guest' = 'idle'

  hostBtn.addEventListener('click', () => {
    mpRole = 'host'
    mine.wrap.style.display = 'flex'
    theirs.wrap.style.display = 'flex'
    mine.label.textContent = t('mp.roomCode')
    theirs.label.textContent = t('mp.answerCode')
    mine.area.value = ''
    theirs.area.value = ''
    goBtn.style.display = ''
    goBtn.textContent = t('mp.connect')
    cb.onHostRoom()
  })

  joinBtn.addEventListener('click', () => {
    mpRole = 'guest'
    theirs.wrap.style.display = 'flex'
    mine.wrap.style.display = 'none'
    theirs.label.textContent = t('mp.roomCode')
    theirs.area.value = ''
    goBtn.style.display = ''
    goBtn.textContent = t('mp.join')
  })

  goBtn.addEventListener('click', () => {
    const code = theirs.area.value.trim()
    if (!code) return
    if (mpRole === 'host') cb.onAcceptAnswer(code)
    else cb.onJoinRoom(code)
  })

  leaveBtn.addEventListener('click', () => {
    mpRole = 'idle'
    mine.wrap.style.display = 'none'
    theirs.wrap.style.display = 'none'
    goBtn.style.display = 'none'
    cb.onLeaveRoom()
  })

  goBtn.style.display = 'none'
  mpScreen.append(mpHint, nameInput, hostBtn, joinBtn, mine.wrap, theirs.wrap, goBtn, mpStatus, leaveBtn)
```

- [ ] **Step 3: Add the entry point and the screen switch**

The main screen already has `optionsBtn` and `aboutBtn`. Add a `multiplayerBtn` beside them, and include it in the `mainScreen.append(...)` list:

```ts
  const multiplayerBtn = document.createElement('button')
  multiplayerBtn.addEventListener('click', () => showMultiplayer())
```

Extend the screen switcher (`showMain`, and whichever functions show the options and about screens) so exactly one screen is displayed. Wherever `showMain()` sets `optionsScreen.style.display = 'none'` etc., add `mpScreen.style.display = 'none'`, and add:

```ts
  function showMultiplayer(): void {
    mainScreen.style.display = 'none'
    optionsScreen.style.display = 'none'
    aboutScreen.style.display = 'none'
    mpScreen.style.display = 'flex'
  }
```

- [ ] **Step 4: Translate on language change**

`paint()` is the function that re-applies every translated string and is already registered with `onLangChange`. Add the new elements to it:

```ts
    mpTitle.textContent = t('mp.title')
    mpHint.textContent = t('mp.hint')
    nameInput.placeholder = t('mp.name')
    multiplayerBtn.textContent = '👥 ' + t('mp.title')
    hostBtn.textContent = t('mp.host')
    joinBtn.textContent = t('mp.join')
    leaveBtn.textContent = t('mp.disconnect')
```

- [ ] **Step 5: Implement the three handle methods**

Add to the object `createMenu` returns:

```ts
    setNetState(state: PeerState, peerName: string | null): void {
      const key =
        state === 'connected' ? 'mp.status.connected'
        : state === 'connecting' ? 'mp.status.connecting'
        : state === 'waiting' ? 'mp.status.waiting'
        : state === 'failed' ? 'mp.status.failed'
        : 'mp.status.idle'
      mpStatus.textContent = t(key) + (state === 'connected' && peerName ? ` — ${peerName}` : '')
      leaveBtn.style.display = state === 'idle' || state === 'closed' ? 'none' : ''
    },
    setRoomCode(code: string): void {
      mine.wrap.style.display = 'flex'
      mine.label.textContent = t('mp.roomCode')
      mine.area.value = code
    },
    setAnswerCode(code: string): void {
      mine.wrap.style.display = 'flex'
      mine.label.textContent = t('mp.answerCode')
      mine.area.value = code
    },
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: errors ONLY at the `createMenu(...)` call in `src/app/main.ts`, because the five new callbacks are not supplied yet. That is Task 9. Do not silence them with stubs here — leave the build red between these two tasks and commit anyway; Task 9 immediately follows.

If `tsc` reports anything else (a typo, a missing screen in the switcher), fix it now.

- [ ] **Step 7: Commit**

```bash
git add src/ui/menu.ts
git commit -m "feat(ui): a Multiplayer screen in the menu — host/join, code boxes, status"
```

---

### Task 9: Wire it into main.ts

**Files:**
- Modify: `src/app/main.ts`

**Interfaces:**
- Consumes: everything produced by Tasks 2-8.
- Produces: the working feature. Nothing later imports from here.

- [ ] **Step 1: Import and declare the session state**

Add near the other imports:

```ts
import { hostRoom, joinRoom, type GuestSession, type HostSession, type Peer } from '../net/peer'
import type { Pose } from '../net/protocol'
import { createRemotePlayers } from './remotePlayers'
import { getPlayerName } from './prefs'
```

And, beside the other module-scope state:

```ts
/** The live LAN session, if any. One peer in v1. */
let peer: Peer | null = null
/** The remote cars. Built once; emptied on disconnect and on a city change. */
const remotePlayers = createRemotePlayers(stage.scene)
/** The one peer's id — a fixed string, since v1 pairs exactly two players. */
const PEER_ID = 'peer'
/** Their name, once their hello has arrived. */
let peerName: string | null = null
/** Accumulates dt so poses go out at ~18 Hz rather than once per frame. */
let poseClock = 0
/** Seconds between outgoing poses. */
const POSE_PERIOD = 1 / 18
```

- [ ] **Step 2: Give the peer its callbacks**

Add a helper next to the other `function` declarations in `main.ts`:

```ts
/** Attach the handlers every peer needs, whichever side of the handshake it came from. */
function wirePeer(p: Peer): void {
  peer = p
  p.onState((s) => {
    menu.setNetState(s, peerName)
    if (s === 'connected') {
      p.sendHello({ t: 'hello', name: getPlayerName(), vehicle: vehicleType })
    }
    if (s === 'closed' || s === 'failed') {
      remotePlayers.dispose()
      peerName = null
      peer = null
    }
  })
  p.onHello((h) => {
    peerName = h.name
    remotePlayers.join(PEER_ID, h.name, h.vehicle)
    remotePlayers.setProvider(provider)
    theme.refreshMovers() // the fresh car comes in day-styled — flip it if we're in neon
    menu.setNetState(p.state(), peerName)
  })
  p.onPose((pose: Pose) => remotePlayers.pose(PEER_ID, pose))
}
```

`vehicleType` and `provider` are the existing variables holding the player's chosen vehicle and the city's `ElevationProvider`. If they carry different names in `main.ts`, use the real ones — do not introduce new state.

- [ ] **Step 3: Supply the five menu callbacks**

In the `createMenu(root, { … }, …)` call, add:

```ts
    onHostRoom: () => {
      void (async () => {
        peer?.close()
        const session: HostSession = await hostRoom({
          v: 1,
          city: currentCity,
          seed: worldSeed,
          weather: activeWeather,
          timeMode: getTimeMode(),
          time: dayTime,
        })
        wirePeer(session)
        hostSession = session
        menu.setRoomCode(session.code)
        menu.setNetState('waiting', null)
      })()
    },
    onAcceptAnswer: (code: string) => {
      void (async () => {
        if (!hostSession) return
        menu.setNetState((await hostSession.acceptAnswer(code)) ? 'connecting' : 'failed', null)
      })()
    },
    onJoinRoom: (code: string) => {
      void (async () => {
        peer?.close()
        const session: GuestSession | null = await joinRoom(code)
        if (!session) {
          menu.setNetState('failed', null)
          return
        }
        wirePeer(session)
        menu.setAnswerCode(session.answerCode)
        menu.setNetState('connecting', null)
        // Build the host's world: their city, their seed, their sky.
        setWorldSeed(session.room.seed)
        applyWeatherSetting(session.room.weather)
        setTimeMode(session.room.timeMode)
        setDayTime(session.room.time)
        void loadCity(session.room.city)
      })()
    },
    onLeaveRoom: () => {
      peer?.close()
      peer = null
      hostSession = null
      peerName = null
      remotePlayers.dispose()
      menu.setNetState('idle', null)
    },
    onPlayerName: (name: string) => {
      peer?.sendHello({ t: 'hello', name, vehicle: vehicleType })
    },
```

with, beside the other state:

```ts
/** Kept so the host can feed the guest's answer code back in. */
let hostSession: HostSession | null = null
```

`currentCity`, `activeWeather`, `dayTime`, `getTimeMode`, `setTimeMode` and `setDayTime` stand for whatever `main.ts` already calls the loaded city query, the resolved current weather, and the day/night phase and its mode. Use the real names — `applyWeatherSetting` and `startAutoAt` are the existing weather entry points, and the time-of-day value is the one `menu.setTime` reflects. **`activeWeather` must be the resolved weather, never `'auto'`** — that is exactly what stops the two skies drifting apart.

- [ ] **Step 4: Send and step in the loop**

Inside the `startLoop((wallDt) => { … })` body, after the player's car has been stepped and next to the existing `rivals.update(...)` call:

```ts
        remotePlayers.update(dt)
        if (peer && peer.state() === 'connected') {
          poseClock += dt
          if (poseClock >= POSE_PERIOD) {
            poseClock = 0
            peer.sendPose({
              x: car.x, y: car.y, z: car.z,
              heading: car.heading,
              speed: Math.hypot(car.vx, car.vz),
              steer: input.steer,
            })
          }
        }
```

`input.steer` is the current `CarInput`'s steer value — use whatever `main.ts` already holds it in.

- [ ] **Step 5: Hand the new terrain over on a city change**

In `loadCity`, where the other per-city consumers are handed the fresh `provider` (near `rivals.reset(...)` / the theme's `setWorld`), add:

```ts
    remotePlayers.setProvider(provider)
```

Remote cars survive a city change — both players load the same city, so their peer stays connected while the world is rebuilt under them.

- [ ] **Step 6: Verify**

```bash
npx tsc --noEmit
npm test
npm run build
npm run boot-check
```
Expected: all four succeed. `boot-check` is mandatory: `main.ts` gained module-scope state, which is exactly the shape of the temporal-dead-zone bug `AGENTS.md` warns about — a green build with a black screen.

- [ ] **Step 7: Commit**

```bash
git add src/app/main.ts
git commit -m "feat(app): wire LAN multiplayer — host/join, pose feed at 18Hz, shared world"
```

---

### Task 10: Live verification, docs and release

**Files:**
- Modify: `package.json` (version), `CHANGELOG.md`, `FEATURES.md`, `TODO.md`

**Interfaces:**
- Consumes: the finished feature.
- Produces: a released version.

- [ ] **Step 1: Ask the user to verify live**

A headless run cannot pair two real peers, so this half is the user's. Ask them to, on two machines on the same network:

1. Open the built game on both (`npm run build && npm run preview -- --host`, or the deployed Pages build).
2. Menu → 👥 Multiplayer → set a name → **Host**. Copy the room code, send it over.
3. On the second machine: 👥 → set a name → **Join**, paste the code, press Join. Copy the answer code back.
4. On the first: paste the answer, press Connect.

What to confirm: the status line reaches "Connected" and names the other player; each sees the other's car moving smoothly with the name over it; the guest's city, weather and time of day match the host's; the two cars pass through each other (no collision — that is by design in v1); pressing **V** on either machine flips the remote car to neon along with everything else; Disconnect removes the other car.

**Do not proceed until the user confirms.** If it fails, report exactly what the status line said and stop.

- [ ] **Step 2: Bump the version**

Edit `package.json`: a **minor** bump (feature), e.g. `0.149.0` → `0.150.0`. Read the current value first rather than assuming.

- [ ] **Step 3: Add the CHANGELOG entry**

At the TOP of `CHANGELOG.md`, matching the existing format:

```markdown
## v0.150.0 — LAN multiplayer (presence)

- **Drive a city with a friend on your network.** Menu → 👥 Multiplayer. One player
  hosts and sends the room code; the other joins and sends the answer code back. No
  server, no account, no install — the code carries everything, including the city.
- Both worlds are built from the same seed, so traffic, boats, benches and lamps land
  in the same places, under the same weather and the same time of day.
- 👀 **What to look for:** the other car moving smoothly with their name over the roof;
  the same city and sky on both screens; press V — their car goes neon too. The two cars
  pass through each other on purpose; collisions between players are not in this version.
  Bots drift apart between the two worlds after a minute or so — also expected for now.
```

- [ ] **Step 4: Update FEATURES.md**

Add a Multiplayer section, in the voice of the surrounding entries:

```markdown
### Multiplayer (LAN)

Drive the same city with a friend on the same network. Open the menu, choose
👥 Multiplayer, pick a name, and either **Host a game** — copy the room code and send it
to your friend — or **Join a game** and paste the code you were sent, then send the answer
code back so the host can paste it in. You will see each other's cars, with names, in a
city built the same way on both machines. Two players; no collisions between them yet.
```

- [ ] **Step 5: Tick the TODO item**

In `TODO.md`, change item **6. LAN multiplayer** from `- [ ]` to `- [x]` and rewrite its body to record what shipped and what was deliberately left out, in the style of the other completed entries:

```markdown
- [x] **6. LAN multiplayer** — ✅ SHIPPED v0.150.0 as **presence**: WebRTC peer-to-peer with a
      copy-pasted room code, no server of any kind (`src/net/roomCode.ts` + `protocol.ts` +
      `peer.ts`, `src/app/remotePlayers.ts`, a Multiplayer screen in `src/ui/menu.ts`). The room
      code carries the city, a world seed, the weather and the time of day, so both clients build
      the same world — every world factory in `main.ts` now draws from a per-layer seeded stream
      (`src/app/worldSeed.ts`) instead of `Math.random`, one stream per layer so a density
      difference can't desync them. 2 players; no collisions between them. NOT done, on purpose:
      N players + discovery (needs something listening on the network — a companion server or
      signalling in the Vite dev server; both cost the zero-install property), racing together
      (bots diverge between the two worlds after a minute — see the spec), chat, voice.
      Spec: `docs/superpowers/specs/2026-07-18-lan-multiplayer-design.md`.
```

- [ ] **Step 6: Final verification**

```bash
npx tsc --noEmit
npm test
npm run build
npm run boot-check
git status --short
```
Expected: the first four succeed; `git status --short` shows only the four edited files (the build leaves no stray files).

- [ ] **Step 7: Commit and open the PR**

```bash
git add package.json CHANGELOG.md FEATURES.md TODO.md
git commit -m "feat: LAN multiplayer (presence) — v0.150.0"
git push -u origin feat/lan-multiplayer
gh pr create --title "feat: LAN multiplayer (presence)" --body "..."
```

The tag and GitHub Release come after the merge to `main`, per `AGENTS.md`: tag `v0.150.0` and push the tag.

---

## Self-Review

**Spec coverage:** room code → Task 2; protocol + interpolation → Task 3; peer → Task 4; shared seed/weather/time → Tasks 2, 5, 9; remote rendering with neon → Task 6; UI in `menu.ts` + name in prefs → Tasks 7, 8; `main.ts` wiring → Task 9; the mDNS/secure-context risk probe → Task 1; pure tests → Tasks 2, 3, 5, 6; live user verification and the release chores → Task 10. Every spec section maps to a task.

**Type consistency:** `Pose` is defined once in Task 3 and consumed unchanged in Tasks 4, 6 and 9. `Room` is defined in Task 2 and consumed in Task 4 and Task 9. `PeerState` is defined in Task 4 and consumed in Task 8's `setNetState` and Task 9's `onState`. `stream(seed, name)` from Task 5 is used only through `rnd(layer)` in Task 5's own wiring. `SMOOTH` is exported by Task 6 and used by Task 6's test only.

**Known soft spots, called out rather than hidden:** Tasks 8 and 9 name existing `main.ts` variables (`vehicleType`, `provider`, `currentCity`, `activeWeather`, `dayTime`, `input.steer`) that the implementer must match to the real identifiers in a 1700-line file; each step says so explicitly and says to use the real names rather than adding new state. Task 8 deliberately ends with a red type-check, resolved by Task 9.
