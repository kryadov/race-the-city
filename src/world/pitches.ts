import * as THREE from 'three'
import type { Pitch, PitchSport, Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import { pointInPolygon } from '../physics/collide'

// Sports pitches (`leisure=pitch`) drawn as a readable playing field, not a
// stadium: a flat green surface panel clipped to the OSM outline, white markings
// (outline + centre line + a centre circle for the sports that have one) painted a
// hair above it, football goals or a basketball hoop at the ends depending on the
// sport, and a few static figures with a ball. Everything is BOUNDED — a nearest-
// first cap on pitches, a global cap on figures, seeded deterministic layout,
// point-in-polygon clipping — and DECORATIVE (no collider; the car drives through
// a goal frame, by design). Static world: its neon look rides the WorldRefs route
// in theme.ts (collectNeonMats), not the live mover scan, exactly like crops.

/** At most this many pitches are drawn, nearest the origin first. */
export const MAX_PITCHES = 48
/** Figures scattered on each pitch, before the global cap bites. */
export const FIGURES_PER_PITCH = 3
/** Total figures across every pitch in the city. */
export const MAX_FIGURES = 60
/** Fixed seed → the same figures and facings on every browser and reload. */
const PITCH_SEED = 0x917cba3d

const SURFACE_LIFT = 0.06 // the green panel, above the terrain
const MARK_LIFT = 0.1 // white paint, above the panel (beats z-fighting)
const MARK_INSET = 0.8 // markings sit this far inside the pitch edge
const MARK_HW = 0.16 // marking-line half-width
const CIRCLE_R = 8.5 // centre-circle radius, clamped to fit the pitch

const GOAL_W = 7.0 // goal mouth width (clamped to the pitch width)
const GOAL_H = 2.3
const POST_T = 0.14 // goal post / crossbar thickness
const GOAL_INSET = 1.0 // goal stands this far in from the end line

const HOOP_H = 3.0
const HOOP_INSET = 0.6
const BOARD_W = 1.7
const BOARD_H = 1.0
const RIM_R = 0.34
const RIM_REACH = 0.5 // how far the rim juts toward the court from the board

const BALL_R = 0.12

const PITCH_GREEN = 0x3f8a3f
const LINE_WHITE = 0xeef0e6
const GOAL_WHITE = 0xdfe2da
const POLE_GREY = 0x9a9ea6
const RIM_ORANGE = 0xdb6a2a
const SKIN = 0xe0ac69
const LEG_TONE = 0x33363d
const FIG_SHIRTS = [0xd0453f, 0x3a6ea5, 0x3f8f5e, 0xd8b23a, 0x8a4f9e, 0xdedad2]
const BALL_WHITE = 0xf2f2f2

const UP = new THREE.Vector3(0, 1, 0)

/** An oriented box fitted to a pitch outline: its centre, long-axis unit vector
 *  and the half-extents along that axis and across it. */
export interface PitchBox {
  cx: number
  cz: number
  ux: number
  uz: number
  halfLen: number
  halfWid: number
}

/** Deterministic PRNG (mulberry32), matching greenery/crops so layout is stable. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Signed area of a ring (positive when counter-clockwise in x/z). */
function ringArea(ring: Vec2[]): number {
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j].x - ring[i].x) * (ring[j].z + ring[i].z)
  }
  return a / 2
}

/**
 * Fit an oriented rectangle to a pitch outline. The long axis is taken from the
 * longest edge (a pitch is drawn as a rectangle, so its longest edge is a side);
 * the extents come from projecting every vertex onto that axis and its normal.
 * The axis is swapped to always point along the longer extent.
 */
export function pitchBox(ring: Vec2[]): PitchBox {
  let cx = 0
  let cz = 0
  for (const p of ring) {
    cx += p.x
    cz += p.z
  }
  cx /= ring.length
  cz /= ring.length

  let bestLen = -1
  let ux = 1
  let uz = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const l = Math.hypot(dx, dz)
    if (l > bestLen) {
      bestLen = l
      ux = dx / (l || 1)
      uz = dz / (l || 1)
    }
  }
  let px = -uz
  let pz = ux
  const extent = (ax: number, az: number): [number, number] => {
    let min = Infinity
    let max = -Infinity
    for (const p of ring) {
      const d = (p.x - cx) * ax + (p.z - cz) * az
      if (d < min) min = d
      if (d > max) max = d
    }
    return [min, max]
  }
  let [minA, maxA] = extent(ux, uz)
  let [minP, maxP] = extent(px, pz)
  // Keep the axis along the longer side, so halfLen >= halfWid always.
  if (maxP - minP > maxA - minA) {
    ;[ux, px] = [px, ux]
    ;[uz, pz] = [pz, uz]
    ;[minA, minP] = [minP, minA]
    ;[maxA, maxP] = [maxP, maxA]
  }
  const ca = (minA + maxA) / 2
  const cq = (minP + maxP) / 2
  return {
    cx: cx + ux * ca + px * cq,
    cz: cz + uz * ca + pz * cq,
    ux,
    uz,
    halfLen: (maxA - minA) / 2,
    halfWid: (maxP - minP) / 2,
  }
}

/**
 * A few points inside the pitch outline, rejection-sampled from its bounding box
 * and clipped by point-in-polygon so none stray off the field. Capped at `max`
 * and deterministic for a given `rng`.
 */
export function figureSpots(ring: Vec2[], rng: () => number, max: number): Vec2[] {
  if (max <= 0 || ring.length < 3) return []
  let minX = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxZ = -Infinity
  for (const p of ring) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.z < minZ) minZ = p.z
    if (p.z > maxZ) maxZ = p.z
  }
  const out: Vec2[] = []
  for (let tries = 0; out.length < max && tries < max * 40; tries++) {
    const x = minX + rng() * (maxX - minX)
    const z = minZ + rng() * (maxZ - minZ)
    if (pointInPolygon(x, z, ring)) out.push({ x, z })
  }
  return out
}

/** One flat quad along a segment, its height sampled at each of the four corners
 *  so it tilts with a sloped pitch instead of lifting off it (like road paint). */
function emitStripe(
  out: number[],
  ax: number,
  az: number,
  bx: number,
  bz: number,
  hw: number,
  provider: ElevationProvider,
  lift: number,
): void {
  const dx = bx - ax
  const dz = bz - az
  const len = Math.hypot(dx, dz) || 1
  const nx = -dz / len
  const nz = dx / len
  const y = (x: number, z: number): number => provider.heightAt(x, z) + lift
  const p: [number, number][] = [
    [ax + nx * hw, az + nz * hw],
    [bx + nx * hw, bz + nz * hw],
    [bx - nx * hw, bz - nz * hw],
    [ax - nx * hw, az - nz * hw],
  ]
  const tri = (i: number, j: number, k: number): void => {
    for (const q of [p[i], p[j], p[k]]) out.push(q[0], y(q[0], q[1]), q[1])
  }
  tri(0, 1, 2)
  tri(0, 2, 3)
}

/** White pitch markings on the oriented box: outline, centre line, centre circle. */
function emitMarkings(out: number[], box: PitchBox, sport: PitchSport, provider: ElevationProvider): void {
  const px = -box.uz
  const pz = box.ux
  const hl = Math.max(0.5, box.halfLen - MARK_INSET)
  const hw = Math.max(0.5, box.halfWid - MARK_INSET)
  const corner = (sl: number, sw: number): [number, number] => [
    box.cx + box.ux * sl * hl + px * sw * hw,
    box.cz + box.uz * sl * hl + pz * sw * hw,
  ]
  const stripe = (a: [number, number], b: [number, number]): void =>
    emitStripe(out, a[0], a[1], b[0], b[1], MARK_HW, provider, MARK_LIFT)
  const pp = corner(1, 1)
  const pm = corner(1, -1)
  const mm = corner(-1, -1)
  const mp = corner(-1, 1)
  stripe(pp, pm)
  stripe(pm, mm)
  stripe(mm, mp)
  stripe(mp, pp)
  // halfway line across the width
  stripe([box.cx + px * hw, box.cz + pz * hw], [box.cx - px * hw, box.cz - pz * hw])
  // centre circle for the sports that have one
  if (sport === 'soccer' || sport === 'basketball') {
    const r = Math.min(CIRCLE_R, hw * 0.6, hl * 0.6)
    const seg = 20
    let prev: [number, number] | null = null
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2
      const cur: [number, number] = [
        box.cx + px * Math.cos(a) * r + box.ux * Math.sin(a) * r,
        box.cz + pz * Math.cos(a) * r + box.uz * Math.sin(a) * r,
      ]
      if (prev) stripe(prev, cur)
      prev = cur
    }
  }
}

/** Y-rotation that turns local +x to point along (dx,dz) on the ground. */
function yawToX(dx: number, dz: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(-dz, dx))
}

interface GoalPost {
  x: number
  z: number
  gy: number
}
interface GoalBar {
  x: number
  z: number
  gy: number
  px: number
  pz: number
  len: number
}
interface Hoop {
  poleX: number
  poleZ: number
  gy: number
  boardX: number
  boardZ: number
  px: number
  pz: number
  rimX: number
  rimZ: number
}

/**
 * Build every pitch in the city as one group: a green surface mesh per pitch,
 * a merged white-markings mesh, instanced goals / hoops, and instanced figures
 * with a ball. Returns an empty group when there are no pitches (no frame cost).
 */
export function buildPitches(pitches: Pitch[], provider: ElevationProvider): THREE.Object3D {
  const group = new THREE.Group()
  if (!pitches.length) return group

  // Nearest the origin first, then capped — the player starts near the middle, so
  // that is where a bounded budget should be spent (the greenery/trains idiom).
  const chosen = pitches
    .map((p) => ({ p, box: pitchBox(p.ring) }))
    .sort((a, b) => a.box.cx * a.box.cx + a.box.cz * a.box.cz - (b.box.cx * b.box.cx + b.box.cz * b.box.cz))
    .slice(0, MAX_PITCHES)

  const rng = makeRng(PITCH_SEED)
  const surfaceMat = new THREE.MeshStandardMaterial({ color: PITCH_GREEN, flatShading: true, side: THREE.DoubleSide })

  const marks: number[] = []
  const goalPosts: GoalPost[] = []
  const goalBars: GoalBar[] = []
  const hoops: Hoop[] = []
  const figs: { x: number; z: number; yaw: number; shirt: number }[] = []
  const balls: Vec2[] = []

  for (const { p, box } of chosen) {
    // Green playing surface, triangulated to the true outline, per-vertex terrain
    // height so it lies on a slope. CCW first, or triangulateShape returns nothing.
    const ring = ringArea(p.ring) < 0 ? p.ring.slice().reverse() : p.ring
    const contour = ring.map((v) => new THREE.Vector2(v.x, v.z))
    const tris = THREE.ShapeUtils.triangulateShape(contour, [])
    const pos: number[] = []
    for (const [a, b, c] of tris) {
      for (const idx of [a, b, c]) {
        const v = ring[idx]
        pos.push(v.x, provider.heightAt(v.x, v.z) + SURFACE_LIFT, v.z)
      }
    }
    if (pos.length) {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      geo.computeVertexNormals()
      const mesh = new THREE.Mesh(geo, surfaceMat)
      mesh.name = 'pitch-surface'
      group.add(mesh)
    }

    emitMarkings(marks, box, p.sport, provider)

    const px = -box.uz
    const pz = box.ux
    if (p.sport === 'basketball') {
      for (const end of [1, -1]) {
        const ex = box.cx + box.ux * (box.halfLen - HOOP_INSET) * end
        const ez = box.cz + box.uz * (box.halfLen - HOOP_INSET) * end
        const gy = provider.heightAt(ex, ez)
        hoops.push({
          poleX: ex,
          poleZ: ez,
          gy,
          boardX: ex,
          boardZ: ez,
          px,
          pz,
          // rim juts toward court centre (opposite the end direction)
          rimX: ex - box.ux * RIM_REACH * end,
          rimZ: ez - box.uz * RIM_REACH * end,
        })
      }
    } else {
      // soccer / tennis / generic all get a football goal at each end
      const goalHW = Math.min(GOAL_W / 2, Math.max(1, box.halfWid * 0.85))
      for (const end of [1, -1]) {
        const ex = box.cx + box.ux * (box.halfLen - GOAL_INSET) * end
        const ez = box.cz + box.uz * (box.halfLen - GOAL_INSET) * end
        const gy = provider.heightAt(ex, ez)
        goalPosts.push({ x: ex + px * goalHW, z: ez + pz * goalHW, gy })
        goalPosts.push({ x: ex - px * goalHW, z: ez - pz * goalHW, gy })
        goalBars.push({ x: ex, z: ez, gy, px, pz, len: goalHW * 2 })
      }
    }

    const want = Math.min(FIGURES_PER_PITCH, MAX_FIGURES - figs.length)
    for (const s of figureSpots(p.ring, rng, want)) {
      figs.push({ x: s.x, z: s.z, yaw: rng() * Math.PI * 2, shirt: FIG_SHIRTS[Math.floor(rng() * FIG_SHIRTS.length)] })
    }
    if (pointInPolygon(box.cx, box.cz, p.ring)) balls.push({ x: box.cx, z: box.cz })
  }

  if (marks.length) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(marks, 3))
    geo.computeVertexNormals()
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: LINE_WHITE, flatShading: true, side: THREE.DoubleSide }))
    mesh.name = 'pitch-markings'
    group.add(mesh)
  }

  buildGoals(group, goalPosts, goalBars)
  buildHoops(group, hoops)
  buildFigures(group, figs, balls, provider)
  return group
}

/** Instanced goal frames: two upright posts and a crossbar per goal. */
function buildGoals(group: THREE.Object3D, posts: GoalPost[], bars: GoalBar[]): void {
  const m = new THREE.Matrix4()
  const pos = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)
  const noRot = new THREE.Quaternion()
  if (posts.length) {
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(POST_T, GOAL_H, POST_T),
      new THREE.MeshStandardMaterial({ color: GOAL_WHITE, flatShading: true }),
      posts.length,
    )
    mesh.frustumCulled = false
    posts.forEach((p, i) => mesh.setMatrixAt(i, m.compose(pos.set(p.x, p.gy + GOAL_H / 2, p.z), noRot, one)))
    mesh.instanceMatrix.needsUpdate = true
    group.add(mesh)
  }
  if (bars.length) {
    // Unit-length box scaled along x to each goal's mouth width, yawed onto the
    // cross-pitch direction, sat at the top of the posts.
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, POST_T, POST_T),
      new THREE.MeshStandardMaterial({ color: GOAL_WHITE, flatShading: true }),
      bars.length,
    )
    mesh.frustumCulled = false
    const scl = new THREE.Vector3()
    bars.forEach((b, i) => {
      mesh.setMatrixAt(i, m.compose(pos.set(b.x, b.gy + GOAL_H, b.z), yawToX(b.px, b.pz), scl.set(b.len, 1, 1)))
    })
    mesh.instanceMatrix.needsUpdate = true
    group.add(mesh)
  }
}

/** Instanced basketball hoops: a pole, a backboard and an orange rim per hoop. */
function buildHoops(group: THREE.Object3D, hoops: Hoop[]): void {
  if (!hoops.length) return
  const m = new THREE.Matrix4()
  const pos = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)
  const noRot = new THREE.Quaternion()
  const n = hoops.length

  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.11, HOOP_H, 6), new THREE.MeshStandardMaterial({ color: POLE_GREY, flatShading: true }), n)
  const boards = new THREE.InstancedMesh(new THREE.BoxGeometry(BOARD_W, BOARD_H, 0.06), new THREE.MeshStandardMaterial({ color: GOAL_WHITE, flatShading: true }), n)
  // A flat ring: rotate the torus into the horizontal plane so it reads as a rim.
  const rimGeo = new THREE.TorusGeometry(RIM_R, 0.04, 6, 12)
  rimGeo.rotateX(Math.PI / 2)
  const rims = new THREE.InstancedMesh(rimGeo, new THREE.MeshStandardMaterial({ color: RIM_ORANGE, flatShading: true }), n)
  for (const im of [poles, boards, rims]) im.frustumCulled = false

  hoops.forEach((h, i) => {
    poles.setMatrixAt(i, m.compose(pos.set(h.poleX, h.gy + HOOP_H / 2, h.poleZ), noRot, one))
    // Board faces along the pitch axis: its width (local x) lies across the pitch.
    const q = yawToX(h.px, h.pz)
    boards.setMatrixAt(i, m.compose(pos.set(h.boardX, h.gy + HOOP_H, h.boardZ), q, one))
    rims.setMatrixAt(i, m.compose(pos.set(h.rimX, h.gy + HOOP_H - BOARD_H / 2, h.rimZ), noRot, one))
  })
  for (const im of [poles, boards, rims]) im.instanceMatrix.needsUpdate = true
  group.add(poles, boards, rims)
}

/** Instanced static figures (torso + head + two legs) and a ball per pitch. */
function buildFigures(
  group: THREE.Object3D,
  figs: { x: number; z: number; yaw: number; shirt: number }[],
  balls: Vec2[],
  provider: ElevationProvider,
): void {
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const pos = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)
  const noRot = new THREE.Quaternion()

  if (figs.length) {
    const n = figs.length
    const torsoGeo = new THREE.BoxGeometry(0.4, 0.62, 0.26)
    torsoGeo.translate(0, 1.12, 0)
    const headGeo = new THREE.SphereGeometry(0.15, 6, 5)
    headGeo.translate(0, 1.58, 0)
    const legGeo = new THREE.BoxGeometry(0.15, 0.8, 0.16)
    legGeo.translate(0, 0.4, 0)
    const torsos = new THREE.InstancedMesh(torsoGeo, new THREE.MeshStandardMaterial({ flatShading: true }), n)
    torsos.name = 'pitch-figures'
    const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ color: SKIN, flatShading: true }), n)
    const legs = new THREE.InstancedMesh(legGeo, new THREE.MeshStandardMaterial({ color: LEG_TONE, flatShading: true }), n * 2)
    for (const im of [torsos, heads, legs]) im.frustumCulled = false
    const col = new THREE.Color()
    figs.forEach((f, i) => {
      const gy = provider.heightAt(f.x, f.z)
      q.setFromAxisAngle(UP, f.yaw)
      pos.set(f.x, gy, f.z)
      m.compose(pos, q, one)
      torsos.setMatrixAt(i, m)
      heads.setMatrixAt(i, m)
      col.setHex(f.shirt)
      torsos.setColorAt(i, col)
      // Two legs, offset either side of centre in the figure's own frame.
      for (let k = 0; k < 2; k++) {
        const off = new THREE.Matrix4().compose(new THREE.Vector3(0, 0, (k === 0 ? 1 : -1) * 0.11), noRot, one)
        legs.setMatrixAt(i * 2 + k, new THREE.Matrix4().multiplyMatrices(m, off))
      }
    })
    torsos.instanceMatrix.needsUpdate = true
    heads.instanceMatrix.needsUpdate = true
    legs.instanceMatrix.needsUpdate = true
    if (torsos.instanceColor) torsos.instanceColor.needsUpdate = true
    group.add(torsos, heads, legs)
  }

  if (balls.length) {
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(BALL_R, 8, 6), new THREE.MeshStandardMaterial({ color: BALL_WHITE, flatShading: true }), balls.length)
    mesh.frustumCulled = false
    balls.forEach((b, i) => mesh.setMatrixAt(i, m.compose(pos.set(b.x, provider.heightAt(b.x, b.z) + BALL_R, b.z), noRot, one)))
    mesh.instanceMatrix.needsUpdate = true
    group.add(mesh)
  }
}
