import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildManholes } from '../../src/world/manholes'
import type { Road, Vec2 } from '../../src/geo/types'

const flat = { heightAt: () => 0 }

/** The road ribbon sits 0.15 above ground (roads.ts ROAD_Y_OFFSET); covers ride on top. */
const ROAD_SURFACE = 0.15
const DEDUP_MIN = 8 // must match manholes.ts
const MIN_GAP = 90
const MAX_GAP = 180
const OFF_CENTRE_MAX = 2.8 // must match manholes.ts
const AJAR_NUDGE_MAX = 0.18 // must match manholes.ts — how far an ajar lid slides off its seat
const BOLT_RING = 0.52 // must match manholes.ts — radius of the ring the four rim fixings sit on

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

  it('lays every cover on the road but off the centreline, into a lane', () => {
    // An L-shaped road: covers sit within a lane of its segments, never off in the grass.
    const roads = [road([{ x: 0, z: 0 }, { x: 300, z: 0 }, { x: 300, z: 200 }])]
    const pts = positions(buildManholes(roads, flat, makeRng(7)))
    expect(pts.length).toBeGreaterThan(0)
    // +AJAR_NUDGE_MAX: an ajar lid may be shoved a touch further out than the base off-centre.
    for (const p of pts) expect(distToRoads(p.x, p.z, roads)).toBeLessThan(OFF_CENTRE_MAX + AJAR_NUDGE_MAX + 0.01)
    // and genuinely off the centreline, not sitting on it
    expect(pts.some((p) => distToRoads(p.x, p.z, roads) > 1)).toBe(true)
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

  it('spaces covers 90-180m apart down a straight road', () => {
    // Single road, so the junction dedupe never fires — the gaps are purely the spacing.
    const pts = positions(buildManholes([straight(1000)], flat, makeRng(11)))
    expect(pts.length).toBeGreaterThan(3)
    const xs = pts.map((p) => p.x).sort((a, b) => a - b)
    // Both ends of a gap may be nudged (the ~1-in-8 ajar lids), so allow 2×AJAR_NUDGE_MAX slop.
    const slop = 2 * AJAR_NUDGE_MAX + 1e-6
    for (let i = 1; i < xs.length; i++) {
      const gap = xs[i] - xs[i - 1]
      expect(gap).toBeGreaterThanOrEqual(MIN_GAP - slop)
      expect(gap).toBeLessThanOrEqual(MAX_GAP + slop)
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
    const short = buildManholes([straight(300)], flat, makeRng(9)).count
    const long = buildManholes([straight(3000)], flat, makeRng(9)).count
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

  it('bakes a raised perpendicular cross-hatch into the shared cover geometry', () => {
    const mesh = buildManholes([straight(400)], flat, makeRng(2))
    expect(mesh).toBeInstanceOf(THREE.InstancedMesh)
    // The dome crowns at DOME_RISE (0.17) and the bolts stand only 0.1 tall; any
    // vertex above 0.175 belongs to a rib standing proud of the dome — proof the
    // waffle rode into the single shared geometry (no extra mesh, no extra draw).
    const pos = mesh.geometry.attributes.position as THREE.BufferAttribute
    let proud = 0
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 0.175) proud++
    expect(proud).toBeGreaterThan(0)
    // Ribs run both ways: some proud vertices sit off the X axis, some off the Z.
    let offX = false
    let offZ = false
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) <= 0.175) continue
      if (Math.abs(pos.getX(i)) > 0.1) offX = true
      if (Math.abs(pos.getZ(i)) > 0.1) offZ = true
    }
    expect(offX && offZ).toBe(true)
  })

  it('bakes four rim fixings (bolts) into the shared geometry, at N/E/S/W and only there', () => {
    // The four cast bolts stand BOLT_H (0.1) proud of the road, but the squashed
    // dome only reaches ~0.085 out at the bolt ring (planar radius 0.52). So a vertex
    // sitting within a bolt's small footprint AND above 0.095 can only be a bolt cap:
    // a clean discriminator that ignores the dome's own ring vertices and the crown
    // ribs alike. (The geometry is shared and rand-independent, so the seed is moot.)
    const geo = buildManholes([straight(400)], flat, makeRng(2)).geometry
    const pos = geo.attributes.position as THREE.BufferAttribute
    const proudAt = (cx: number, cz: number): number => {
      let n = 0
      for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) <= 0.095) continue // below the bolt caps: dome or ribs, not a fixing
        if (Math.hypot(pos.getX(i) - cx, pos.getZ(i) - cz) < 0.06) n++
      }
      return n
    }
    // A fixing at each of the four cardinal points on the rim...
    for (const [cx, cz] of [[BOLT_RING, 0], [-BOLT_RING, 0], [0, BOLT_RING], [0, -BOLT_RING]]) {
      expect(proudAt(cx, cz)).toBeGreaterThan(0)
    }
    // ...and nowhere else on the ring: the diagonals between them carry no bolt, so
    // it reads as four discrete fixings, not a continuous ridge around the rim.
    const d = BOLT_RING / Math.SQRT2 // the four points 45° off the cardinals, same radius
    for (const [cx, cz] of [[d, d], [-d, d], [d, -d], [-d, -d]]) {
      expect(proudAt(cx, cz)).toBe(0)
    }
  })

  it('sets a deterministic few covers ajar (tilted off-flat) while most sit flush — all in ≤2 instanced draws', () => {
    const mesh = buildManholes([straight(6000)], flat, makeRng(21))
    // One InstancedMesh for the lot: the four rim fixings are baked into its shared
    // geometry, not a second batch — so the whole thing is ≤2 instanced draws (in fact 1).
    expect(mesh).toBeInstanceOf(THREE.InstancedMesh)
    expect(mesh.count).toBeGreaterThan(20)

    const up = new THREE.Vector3(0, 1, 0)
    const m = new THREE.Matrix4()
    const p = new THREE.Vector3()
    const rot = new THREE.Quaternion()
    const sc = new THREE.Vector3()
    let tilted = 0
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m)
      m.decompose(p, rot, sc)
      // A flush lid only spins about Y, so its up-vector stays dead vertical (y = 1);
      // a tilted one tips its up-vector off vertical. cos(~3°) ≈ 0.9986 is the cutoff.
      if (up.clone().applyQuaternion(rot).y < 0.9986) tilted++
    }
    expect(tilted).toBeGreaterThan(0) // some are ajar...
    expect(tilted).toBeLessThan(mesh.count / 2) // ...but most sit flush
  })
})
