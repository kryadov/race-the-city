import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildBridges, deckDepth, pierFootprints, PIER_COLLIDER_R, type PierCollider } from '../../src/world/bridgeMesh'
import { buildDecks, MAX_ARCH } from '../../src/world/bridge'
import { roadWidth } from '../../src/world/roads'
import { SpatialGrid } from '../../src/physics/grid'
import { resolveCircle } from '../../src/physics/collide'
import type { Road, Vec2 } from '../../src/geo/types'

const flat = { heightAt: () => 0 }
const v = (x: number, z: number): Vec2 => ({ x, z })

/** A 100m overpass: layer 1, so it arches. */
const overpass: Road = {
  points: Array.from({ length: 11 }, (_, i) => v(i * 10, 0)),
  kind: 'primary',
  bridge: true,
  layer: 1,
}

/** Every Y in the built geometry. */
function heights(o: THREE.Object3D): number[] {
  const ys: number[] = []
  o.traverse((c) => {
    const g = (c as THREE.Mesh).geometry
    const pos = g?.attributes?.position
    if (!pos) return
    for (let i = 0; i < pos.count; i++) ys.push(pos.getY(i))
  })
  return ys
}

/** Every vertex in the non-instanced geometry (deck slab + railings). */
function verts(o: THREE.Object3D): { x: number; y: number; z: number }[] {
  const out: { x: number; y: number; z: number }[] = []
  o.traverse((c) => {
    if ((c as THREE.InstancedMesh).isInstancedMesh) return // piers live in matrices
    const pos = (c as THREE.Mesh).geometry?.attributes?.position
    if (!pos) return
    for (let i = 0; i < pos.count; i++) out.push({ x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i) })
  })
  return out
}

/** How many pier instances the build raised in total. */
function pierCount(o: THREE.Object3D): number {
  let n = 0
  o.traverse((c) => { if ((c as THREE.InstancedMesh).isInstancedMesh) n += (c as THREE.InstancedMesh).count })
  return n
}

/**
 * A ~260m river with 6m banks and 0m water: banks outside [30,230], water
 * between, 10m ramps. A stand-in for the wide Santiago crossing the deck read
 * wrong over.
 */
const BANK = 6
const wideRiver = {
  heightAt: (x: number): number => {
    if (x <= 20 || x >= 240) return BANK
    if (x >= 30 && x <= 230) return 0
    return x < 30 ? BANK - ((x - 20) / 10) * BANK : ((x - 230) / 10) * BANK
  },
}
/** The wide crossing itself: a 260m primary on layer 1, densified by buildDecks. */
const river = (layer = 1): Road => ({
  points: Array.from({ length: 27 }, (_, i) => v(i * 10, 0)),
  kind: 'primary',
  bridge: true,
  layer,
})

describe('buildBridges', () => {
  const decks = buildDecks([overpass], flat)

  it('builds the deck to its profile, not flat at its first point', () => {
    // The bug: emitRibbon hands the y callback the EDGE vertices, whose
    // coordinates aren't the road points'. Looking the height up by position
    // missed every time and fell back to y[0] — a flat deck, while the car drove
    // the profiled one underneath it.
    const mesh = buildBridges(decks, flat)
    const ys = heights(mesh)
    const span = Math.max(...ys) - Math.min(...ys)
    expect(span, 'an arched deck cannot be flat').toBeGreaterThan(3)
  })

  it('takes the deck as high as the profile says', () => {
    const peak = Math.max(...decks[0].y)
    const ys = heights(buildBridges(decks, flat))
    expect(Math.max(...ys)).toBeGreaterThanOrEqual(peak - 0.01)
  })

  it('never leaves the deck below the ground it spans', () => {
    for (const y of heights(buildBridges(decks, flat))) expect(y).toBeGreaterThanOrEqual(-0.01)
  })

  it('builds nothing for a city with no bridges', () => {
    expect(buildBridges([], flat).children).toHaveLength(0)
  })
})

describe('deckDepth', () => {
  it('keeps the shallow base slab on a short span', () => {
    // A 100m overpass is a thin slab; nothing to deepen.
    expect(deckDepth(80)).toBeCloseTo(0.6)
    expect(deckDepth(100)).toBeCloseTo(0.6)
  })

  it('deepens the girder as the span grows, so a wide deck is not a thin sheet', () => {
    expect(deckDepth(260)).toBeGreaterThan(deckDepth(100))
  })

  it('caps the depth, so it never becomes a wall', () => {
    // The bound is what keeps a very long span from growing an absurd girder.
    expect(deckDepth(100_000)).toBeLessThanOrEqual(3.0 + 1e-6)
    expect(deckDepth(260)).toBeLessThanOrEqual(3.0 + 1e-6)
  })
})

describe('a bridge over a wide river', () => {
  const decks = buildDecks([river()], wideRiver)

  it('lands the deck on both banks, with no thin/floating gap at the ends', () => {
    // The endpoints sit ON the banks (6m), not sagging down to the water. Look at
    // every vertex within half a metre of each end: the whole deck+railing there
    // must be up at bank height, never dropping toward the 0m river below it.
    const vs = verts(buildBridges(decks, wideRiver))
    for (const endX of [0, 260]) {
      const atEnd = vs.filter((p) => Math.abs(p.x - endX) < 0.5)
      expect(atEnd.length, 'the deck reaches the bank').toBeGreaterThan(0)
      for (const p of atEnd) expect(p.y, 'the deck end must not float off the bank').toBeGreaterThan(BANK - 0.1)
    }
  })

  it('stands on a handful of piers like a viaduct, not a comb of stilts', () => {
    // The bug: a pier under every densified deck point (one every ~4m) put ~50
    // thin stilts under the 260m crossing — most of why it read as flimsy. Spaced
    // piers give an order of magnitude fewer, comfortably under span/20.
    const n = pierCount(buildBridges(decks, wideRiver))
    expect(n).toBeGreaterThan(2) // it is still held up
    expect(n, 'a pier every few metres is a centipede, not a bridge').toBeLessThan(260 / 20)
  })

  it('bounds the arch rise on a wide span, however silly the layer', () => {
    // A long span must not hump absurdly: the rise is capped (MAX_ARCH) so the
    // whole deck, railings and all, stays within a bounded lift of the banks.
    const silly = buildDecks([river(40)], wideRiver)
    const peak = Math.max(...heights(buildBridges(silly, wideRiver)))
    expect(peak - BANK).toBeLessThanOrEqual(MAX_ARCH + 1.5) // + railing headroom
  })
})

describe('bridge piers stand off the carriageway, clear of a road passing under', () => {
  // The river runs along x at z=0, so the deck centreline is z=0 and the deck
  // spans z ∈ [-half, +half]. A road crossing UNDER the bridge would run down
  // that centreline, so a pier there walls it off — the piers must stand off it.
  const half = roadWidth('primary') / 2
  const decks = buildDecks([river()], wideRiver)
  const piers = buildBridges(decks, wideRiver).userData.piers as PierCollider[]

  it('offsets every pier off the deck centreline, but keeps it under the deck', () => {
    expect(piers.length, 'a wide viaduct raised no piers').toBeGreaterThan(2)
    for (const p of piers) {
      // Off the centreline: not planted in the middle where a lower road runs.
      expect(Math.abs(p.z), 'a pier is sat on the deck centreline').toBeGreaterThan(1)
      // Still under the deck slab (within its half-width), not floated off the side.
      expect(Math.abs(p.z), 'a pier floated off the edge of the deck').toBeLessThan(half)
    }
  })

  it('raises the piers in symmetric pairs, one near each deck edge', () => {
    const leftE = piers.filter((p) => p.z > 0)
    const rightE = piers.filter((p) => p.z < 0)
    expect(leftE.length, 'no pier on the +z edge').toBeGreaterThan(0)
    expect(leftE.length, 'the two edges are unevenly propped').toBe(rightE.length)
    // Each +z pier has a partner mirrored across the centreline at the same point.
    for (const p of leftE) {
      const twin = rightE.find((q) => Math.abs(q.x - p.x) < 1e-6)
      expect(twin, 'a pier with no partner on the far edge').toBeTruthy()
      expect(twin!.z).toBeCloseTo(-p.z, 6)
      expect(twin!.top).toBeCloseTo(p.top, 6) // shared underside: the deck is flat across
    }
  })

  it('centres each collider footprint on the pier as drawn', () => {
    const { footprints, tops } = pierFootprints(piers)
    expect(footprints).toHaveLength(piers.length)
    footprints.forEach((fp, k) => {
      const cx = fp.reduce((s, c) => s + c.x, 0) / fp.length
      const cz = fp.reduce((s, c) => s + c.z, 0) / fp.length
      expect(cx, 'the footprint drifted off the drawn pier').toBeCloseTo(piers[k].x, 6)
      expect(cz, 'the footprint drifted off the drawn pier').toBeCloseTo(piers[k].z, 6)
      expect(tops[k]).toBeCloseTo(piers[k].top, 6) // capped at the deck underside
    })
  })
})

describe('bridge piers are solid to the road below, not the deck above', () => {
  it('stashes the raised piers on the group for the collider', () => {
    const decks = buildDecks([river()], wideRiver)
    const piers = buildBridges(decks, wideRiver).userData.piers as PierCollider[]
    expect(Array.isArray(piers)).toBe(true)
    expect(piers.length, 'a wide viaduct raised no piers').toBeGreaterThan(2)
    for (const p of piers) expect(p.top, 'a pier that does not stand up').toBeGreaterThan(p.ground)
  })

  it('builds a square footprint per pier, capped at the deck underside', () => {
    const { footprints, tops } = pierFootprints([{ x: 10, z: -4, top: 8, ground: 0 }])
    expect(footprints).toHaveLength(1)
    expect(tops).toEqual([8]) // the collider top is the deck underside, not the pier's full height
    const fp = footprints[0]
    expect(fp).toHaveLength(4)
    for (const c of fp) {
      expect(Math.abs(Math.abs(c.x - 10) - PIER_COLLIDER_R)).toBeLessThan(1e-9)
      expect(Math.abs(Math.abs(c.z + 4) - PIER_COLLIDER_R)).toBeLessThan(1e-9)
    }
  })

  it('stops a car on the road below but lets one on the deck pass over', () => {
    const { footprints, tops } = pierFootprints([{ x: 0, z: 0, top: 10, ground: 0 }])
    const grid = new SpatialGrid(footprints, 25, tops)
    // a car down on the ground (y=0), sitting on the pier — shoved clear of it
    const below = resolveCircle(0, 0, 1.3, grid, 0)
    expect(Math.hypot(below.x, below.z), 'the pier let a car drive through it').toBeGreaterThan(0.5)
    // the same car up on the deck (above the underside) — passes untouched
    const above = resolveCircle(0, 0, 1.3, grid, 12)
    expect(above).toEqual({ x: 0, z: 0 })
  })
})
