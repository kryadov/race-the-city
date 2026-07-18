import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildManholes } from '../../src/world/manholes'
import type { Road, Vec2 } from '../../src/geo/types'

const flat = { heightAt: () => 0 }

/** The road ribbon sits 0.15 above ground (roads.ts ROAD_Y_OFFSET); covers ride on top. */
const ROAD_SURFACE = 0.15
const DEDUP_MIN = 8 // must match manholes.ts
const MIN_GAP = 18
const MAX_GAP = 30

const road = (points: Vec2[], extra: Partial<Road> = {}): Road => ({ points, kind: 'residential', ...extra })
const straight = (len: number, extra: Partial<Road> = {}): Road =>
  road([{ x: 0, z: 0 }, { x: len, z: 0 }], extra)

/** Deterministic PRNG (mulberry32) so a test's layout is the same every run. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** World positions of every instance in the mesh. */
function positions(mesh: THREE.InstancedMesh): THREE.Vector3[] {
  const m = new THREE.Matrix4()
  const p = new THREE.Vector3()
  const q = new THREE.Quaternion()
  const s = new THREE.Vector3()
  const out: THREE.Vector3[] = []
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m)
    m.decompose(p, q, s)
    out.push(p.clone())
  }
  return out
}

/** Planar (x,z) distance from a point to a segment. */
function distToSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax
  const dz = bz - az
  const l2 = dx * dx + dz * dz
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz))
}

/** Nearest distance from (x,z) to any segment of any of the given roads. */
function distToRoads(x: number, z: number, roads: Road[]): number {
  let best = Infinity
  for (const r of roads) {
    for (let i = 0; i < r.points.length - 1; i++) {
      const a = r.points[i]
      const b = r.points[i + 1]
      best = Math.min(best, distToSeg(x, z, a.x, a.z, b.x, b.z))
    }
  }
  return best
}

describe('buildManholes', () => {
  it('returns a single instanced mesh — one draw call for the whole city', () => {
    const mesh = buildManholes([straight(500)], flat, makeRng(1))
    expect(mesh).toBeInstanceOf(THREE.InstancedMesh)
    expect(mesh.count).toBeGreaterThan(0)
  })

  it('lays every cover on a road centreline', () => {
    // An L-shaped road: covers must sit on its segments, never off in the grass.
    const roads = [road([{ x: 0, z: 0 }, { x: 300, z: 0 }, { x: 300, z: 200 }])]
    const pts = positions(buildManholes(roads, flat, makeRng(7)))
    expect(pts.length).toBeGreaterThan(0)
    for (const p of pts) expect(distToRoads(p.x, p.z, roads)).toBeLessThan(1e-4)
  })

  it('sits the cover on the road surface, a touch proud, following the terrain', () => {
    const onFlat = positions(buildManholes([straight(400)], flat, makeRng(2)))
    for (const p of onFlat) {
      expect(p.y).toBeGreaterThan(ROAD_SURFACE) // proud of the tarmac, not sunk into it
      expect(p.y).toBeLessThan(0.3) // ...but only just
    }
    const hill = { heightAt: () => 50 }
    const onHill = positions(buildManholes([straight(400)], hill, makeRng(2)))
    for (const p of onHill) {
      expect(p.y).toBeGreaterThan(50 + ROAD_SURFACE)
      expect(p.y).toBeLessThan(50.5)
    }
  })

  it('spaces covers 18-30m apart down a straight road', () => {
    // Single road, so the junction dedupe never fires — the gaps are purely the spacing.
    const pts = positions(buildManholes([straight(1000)], flat, makeRng(11)))
    expect(pts.length).toBeGreaterThan(20)
    const xs = pts.map((p) => p.x).sort((a, b) => a - b)
    for (let i = 1; i < xs.length; i++) {
      const gap = xs[i] - xs[i - 1]
      expect(gap).toBeGreaterThanOrEqual(MIN_GAP - 1e-6)
      expect(gap).toBeLessThanOrEqual(MAX_GAP + 1e-6)
    }
  })

  it('puts none on a bridge road, and none on a tunnel road', () => {
    for (const flag of [{ bridge: true }, { tunnel: true }]) {
      expect(buildManholes([straight(600, flag)], flat, makeRng(3)).count).toBe(0)
    }
  })

  it('ignores the bridge deck even when a normal road runs alongside', () => {
    const ground = road([{ x: 0, z: 0 }, { x: 500, z: 0 }])
    const bridge = road([{ x: 0, z: 40 }, { x: 500, z: 40 }], { bridge: true })
    const withBridge = buildManholes([ground, bridge], flat, makeRng(5))
    const groundOnly = buildManholes([ground], flat, makeRng(5))
    // The bridge contributes nothing: same covers with or without it...
    expect(withBridge.count).toBe(groundOnly.count)
    // ...and none of them landed on the bridge's line.
    for (const p of positions(withBridge)) {
      expect(distToRoads(p.x, p.z, [bridge])).toBeGreaterThan(DEDUP_MIN)
    }
  })

  it('scales the cover count with road length', () => {
    const short = buildManholes([straight(100)], flat, makeRng(9)).count
    const long = buildManholes([straight(1000)], flat, makeRng(9)).count
    expect(short).toBeGreaterThan(0)
    expect(long).toBeGreaterThan(short * 5) // ~10× the length, so many more covers
  })

  it('never lets two covers share a spot', () => {
    // A grid whose roads meet at shared junction vertices — the case that would
    // pile covers on top of one another without the dedupe.
    const roads: Road[] = []
    for (const y of [0, 100, 200]) roads.push(road([{ x: 0, z: y }, { x: 200, z: y }]))
    for (const x of [0, 100, 200]) roads.push(road([{ x, z: 0 }, { x, z: 200 }]))
    const pts = positions(buildManholes(roads, flat, makeRng(13)))
    expect(pts.length).toBeGreaterThan(0)

    // No exact duplicates...
    const keys = new Set(pts.map((p) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`))
    expect(keys.size).toBe(pts.length)
    // ...and in fact nothing is even crowded: every pair is at least DEDUP_MIN apart.
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z)
        expect(d).toBeGreaterThanOrEqual(DEDUP_MIN - 1e-6)
      }
    }
  })

  it('folds two copies of a road down to one set of covers', () => {
    // A constant RNG makes both copies place covers in identical spots; the
    // dedupe must throw the whole second copy away rather than double up.
    const r = straight(300)
    const once = buildManholes([r], flat, () => 0.5).count
    const twice = buildManholes([r, r], flat, () => 0.5).count
    expect(once).toBeGreaterThan(0)
    expect(twice).toBe(once)
  })

  it('gives each cover its own colour instance (never vertexColors), and is empty for no roads', () => {
    const mesh = buildManholes([straight(400)], flat, makeRng(4))
    expect(mesh.instanceColor).not.toBeNull()
    const mat = mesh.material as THREE.MeshStandardMaterial
    expect(mat).toBeInstanceOf(THREE.MeshStandardMaterial) // so the neon theme can restyle it
    expect(mat.vertexColors).toBe(false) // per-instance shade rides on instanceColor, not vertexColors

    const empty = buildManholes([], flat, makeRng(4))
    expect(empty.count).toBe(0)
  })
})
