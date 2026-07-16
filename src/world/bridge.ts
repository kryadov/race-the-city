import type { Road, Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import { roadWidth } from './roads'

/** Height one OSM `layer` step lifts a deck, in metres. */
export const LAYER_H = 5
/** Headroom a deck keeps over the ground it spans. */
export const CLEARANCE = 4.5
/** Cap, so a bad `layer` can't launch a road into orbit. */
export const MAX_ARCH = 14

/** A bridge road with the height of its deck at each of its points. */
export interface Deck {
  road: Road
  y: number[] // one per road.points
}

/** The arch is sampled at the deck's points, so they must be close together. */
export const DECK_STEP = 4

/**
 * Split a polyline so no segment is longer than `step`.
 *
 * A bridge in OSM is often two or three nodes. The arch is a sine sampled at the
 * points, so three of them put the whole rise in a single vertex: a triangle
 * with a kink at the top that pitches the car into the air. Points every few
 * metres make it the curve it is meant to be.
 */
export function densify(points: Vec2[], step = DECK_STEP): Vec2[] {
  if (points.length < 2) return points.slice()
  const out: Vec2[] = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    const n = Math.max(1, Math.ceil(len / step))
    for (let k = 1; k <= n; k++) {
      out.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n })
    }
  }
  return out
}

/** Cumulative distance along a polyline, normalised to 0..1. */
export function arcParams(points: Vec2[]): number[] {
  const d: number[] = [0]
  for (let i = 1; i < points.length; i++) {
    d.push(d[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z))
  }
  const total = d[d.length - 1]
  return total > 0 ? d.map((v) => v / total) : d.map(() => 0)
}

/**
 * The height of a bridge deck at each of its points.
 *
 * The ends sit on the ground, because that is where the approach roads meet
 * them — a deck stamped at a flat height leaves a step you cannot drive up.
 * Between them the deck runs straight from end to end and arches over the
 * middle, which is what makes it a bridge you can climb onto rather than a slab
 * hanging in the air.
 *
 * The arch is the greater of what `layer` asks for and what it takes to clear
 * the ground underneath — so an overpass rises over the road it crosses, while a
 * river bridge, whose banks are already above the water, stays nearly flat.
 */
export function deckHeights(road: Road, provider: ElevationProvider): number[] {
  const pts = road.points
  const s = arcParams(pts)
  const y0 = provider.heightAt(pts[0].x, pts[0].z)
  const y1 = provider.heightAt(pts[pts.length - 1].x, pts[pts.length - 1].z)
  const chord = (i: number): number => y0 + (y1 - y0) * s[i]

  // How far the ground pokes up through the chord, at its worst. Only ground
  // ABOVE the chord needs clearing: measuring from the ground itself would arch
  // every bridge, including one lying flat across level ground.
  let poke = 0
  for (let i = 0; i < pts.length; i++) {
    poke = Math.max(poke, provider.heightAt(pts[i].x, pts[i].z) - chord(i))
  }
  const clear = poke > 0 ? poke + CLEARANCE : 0
  const arch = Math.min(MAX_ARCH, Math.max((road.layer ?? 0) * LAYER_H, clear))

  // sin() is zero at both ends by construction, so the deck always meets the
  // approach roads however high it rises in the middle.
  return pts.map((_, i) => chord(i) + Math.sin(Math.PI * s[i]) * arch)
}

export function buildDecks(roads: Road[], provider: ElevationProvider): Deck[] {
  return roads
    .filter((r) => r.bridge && r.points.length >= 2)
    .map((r) => {
      // Densified first: the deck it carries must be the one the profile was
      // built on, or the mesh and the drivable surface disagree.
      const road: Road = { ...r, points: densify(r.points) }
      return { road, y: deckHeights(road, provider) }
    })
}

interface Seg {
  ax: number
  az: number
  bx: number
  bz: number
  ay: number
  by: number
  r2: number
}

export interface DeckIndex {
  /** The deck height over this spot, or null if no bridge covers it. */
  heightAt(x: number, z: number): number | null
}

/** Distance² from a point to a segment, plus how far along it that lands. */
function closest(px: number, pz: number, s: Seg): { d2: number; t: number } {
  const dx = s.bx - s.ax
  const dz = s.bz - s.az
  const len2 = dx * dx + dz * dz
  let t = len2 > 0 ? ((px - s.ax) * dx + (pz - s.az) * dz) / len2 : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const cx = s.ax + dx * t
  const cz = s.az + dz * t
  return { d2: (px - cx) ** 2 + (pz - cz) ** 2, t }
}

/**
 * Where the decks are, so the car and everything else can ask what is overhead.
 * Segments are tested directly: a city has a handful of bridges, and building a
 * grid for them would cost more than it saves.
 *
 * @param margin widen every deck by this much. Nought for driving — you should
 *   fall off the edge — but street furniture stands *beside* the carriageway and
 *   markings run right to its edge, and without a margin they miss the deck and
 *   drop to the ground under the bridge.
 */
export function createDeckIndex(decks: Deck[], margin = 0): DeckIndex {
  const segs: Seg[] = []
  for (const d of decks) {
    const half = roadWidth(d.road.kind) / 2 + margin
    for (let i = 0; i < d.road.points.length - 1; i++) {
      const a = d.road.points[i]
      const b = d.road.points[i + 1]
      segs.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, ay: d.y[i], by: d.y[i + 1], r2: half * half })
    }
  }
  return {
    heightAt(x, z) {
      let best: number | null = null
      for (const s of segs) {
        const { d2, t } = closest(x, z, s)
        if (d2 > s.r2) continue
        const y = s.ay + (s.by - s.ay) * t
        // Stacked crossings: the highest deck wins, and the car picks between
        // that and the ground by where it already was.
        if (best === null || y > best) best = y
      }
      return best
    },
  }
}

/** How close to a deck the car must already be to be riding it, in metres. */
export const DECK_SNAP = 2.0

/**
 * The height the car sits at: the deck if it is already on it, otherwise the
 * ground.
 *
 * Judged from where the car was last frame, not from where it is now — a test
 * on the new position alone would teleport it onto any bridge it drove under.
 *
 * @param prevY the car's height last frame
 */
export function surfaceUnder(
  x: number,
  z: number,
  prevY: number,
  terrainY: number,
  decks: DeckIndex,
): number {
  const deckY = decks.heightAt(x, z)
  if (deckY === null) return terrainY
  return Math.abs(prevY - deckY) < DECK_SNAP ? deckY : terrainY
}
