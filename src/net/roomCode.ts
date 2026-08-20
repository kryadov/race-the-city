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

async function pipe(bytes: Uint8Array, stream: TransformStream<BufferSource, Uint8Array>): Promise<Uint8Array> {
  const written = new Blob([bytes as BlobPart]).stream().pipeThrough(stream as TransformStream<Uint8Array, Uint8Array>)
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
