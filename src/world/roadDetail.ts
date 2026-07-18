import * as THREE from 'three'
import type { Road, RoadKind, Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import { roadWidth, ROAD_Y_OFFSET } from './roads'

const DASH_KINDS = new Set<RoadKind>(['motorway', 'primary', 'secondary'])
const LAMP_KINDS = new Set<RoadKind>(['motorway', 'primary', 'secondary'])
const SIGN_KINDS = new Set<RoadKind>(['motorway', 'primary'])
const DASH_SPACING = 7
const DASH_LEN = 3.2
const DASH_HW = 0.16
const MAX_DASHES = 4000
/** How far above the ribbon its paint sits — enough to beat z-fighting, no more. */
const PAINT_HAIR = 0.03
const LAMP_SPACING = 30 // metres between lamps along a road
const WORKING_LAMPS = 520 // pre-filter cap (keeps the mid-road check cheap)
const MAX_LAMPS = 170 // final network budget
const POLE_H = 5.0
const ARM_LEN = 1.5 // how far the arm reaches out over the carriageway
const POLE_OFFSET = 0.8 // pole base this far beyond the road edge
const REJECT_MARGIN = 0.6 // reject a pole base within (roadHalfWidth + this) of any road
const POOL_R = 5.0
const SIGN_MIN_LEN = 90
const MAX_SIGNS = 22

/** A lamp: pole base position + unit direction toward the road (arm reach). */
interface Lamp {
  x: number
  z: number
  dx: number
  dz: number
  /** Which road put it here — the one whose surface it stands on. */
  road: number
}

/** A sign: post position + unit road direction (the sign faces along it). */
interface Sign {
  x: number
  z: number
  ux: number
  uz: number
  /** Which road put it here — the one whose surface it stands beside. */
  road: number
}

/** A road centre-line segment with its half-width, for the mid-road rejection test. */
interface Seg {
  ax: number
  az: number
  bx: number
  bz: number
  hw: number
}

/**
 * Night-reactive lamp lens. One shared material for every lamp head; the render
 * loop sets its emissiveIntensity from how dark it is, so all lamps light up at
 * dusk with zero per-instance work.
 */
export const LAMP_MAT = new THREE.MeshStandardMaterial({
  color: 0x2b2a26,
  emissive: 0xffcf7a,
  emissiveIntensity: 0,
  flatShading: true,
})

/**
 * The soft pool of light a lamp throws on the ground at night. Additive + a
 * radial alpha falloff; the render loop scales its opacity with darkness.
 */
export const POOL_MAT = new THREE.MeshBasicMaterial({
  color: 0xffd9a0,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexColors: true,
})

const POLE_MAT = new THREE.MeshStandardMaterial({ color: 0x9a9ea6, flatShading: true })
const LUMINAIRE_MAT = new THREE.MeshStandardMaterial({ color: 0xb9b6ad, flatShading: true })
const SIGN_POST_MAT = new THREE.MeshStandardMaterial({ color: 0x74777d, flatShading: true })
const SIGN_PANEL_MAT = new THREE.MeshStandardMaterial({ color: 0x2f7d3b, flatShading: true })
const SIGN_ARROW_MAT = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, flatShading: true })

/** Lightweight road dressing: dashed centre lines + street lamps + arrow signs. */
/** The ground under a road's own markings, lamps and signs. */
export type DetailGround = ElevationProvider | ((roadIndex: number) => ElevationProvider)

/**
 * @param provider the ground, or — where each road sits on a surface of its own
 *   — a function from the road's index to it. A bridge's markings belong on ITS
 *   deck: asking one index of every deck for "the height here" hands a bridge
 *   running under a flyover the flyover's height, and its markings are then
 *   painted ten metres above the road they belong to, with the car underneath.
 */
export function buildRoadDetail(roads: Road[], provider: DetailGround): THREE.Object3D {
  const groundOf = (r: number): ElevationProvider =>
    typeof provider === 'function' ? provider(r) : provider
  // How far the drivable ribbon sits above the height the provider reports, so a
  // dash lands a hair above the ROAD rather than a fixed height above the bare
  // terrain. A plain provider is the terrain the tarmac is lifted ROAD_Y_OFFSET
  // onto; a per-road function (see DetailGround) is a deck the road sits directly
  // on, whose reported height IS the surface. Blindly adding ROAD_Y_OFFSET to the
  // deck case floated every bridge's markings that far above their own deck.
  const ribbonLift = typeof provider === 'function' ? 0 : ROAD_Y_OFFSET
  const group = new THREE.Group()
  const dash: number[] = []
  const lamps: Lamp[] = []
  const signs: Sign[] = []
  const segs: Seg[] = []
  let dashes = 0

  for (let r = 0; r < roads.length; r++) {
    const road = roads[r]
    const wide = DASH_KINDS.has(road.kind)
    const lamped = LAMP_KINDS.has(road.kind)
    const signed = SIGN_KINDS.has(road.kind)
    const hw = roadWidth(road.kind) / 2
    if (road.points.length < 2) continue
    const side = r % 2 === 0 ? 1 : -1 // lamps on one alternating side per road
    let carryDash = 0
    let carryLamp = 0
    let roadLen = 0

    for (let i = 0; i < road.points.length - 1; i++) {
      const a = road.points[i]
      const b = road.points[i + 1]
      const dx = b.x - a.x
      const dz = b.z - a.z
      const len = Math.hypot(dx, dz)
      if (len < 0.01) continue
      segs.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, hw }) // every road contributes to the reject test
      roadLen += len
      const ux = dx / len
      const uz = dz / len
      const nx = -uz
      const nz = ux

      if (wide && dashes < MAX_DASHES) {
        let d = carryDash
        for (; d < len && dashes < MAX_DASHES; d += DASH_SPACING) {
          const e = Math.min(d + DASH_LEN, len)
          emitDash(dash, a.x + ux * d, a.z + uz * d, a.x + ux * e, a.z + uz * e, nx, nz, groundOf(r), ribbonLift + PAINT_HAIR)
          dashes++
        }
        carryDash = d - len
      }

      if (lamped) {
        let d = carryLamp
        for (; d < len; d += LAMP_SPACING) {
          // pole base just outside the road edge; arm reaches back over the road
          lamps.push({
            x: a.x + ux * d + nx * side * (hw + POLE_OFFSET),
            z: a.z + uz * d + nz * side * (hw + POLE_OFFSET),
            dx: -side * nx,
            dz: -side * nz,
            road: r,
          })
        }
        carryLamp = d - len
      }
    }

    if (signed && roadLen >= SIGN_MIN_LEN && signs.length < MAX_SIGNS) {
      const p = pointAlong(road.points, roadLen * 0.35)
      if (p) signs.push({ x: p.x - p.nx * side * (hw + 1.0), z: p.z - p.nz * side * (hw + 1.0), ux: p.ux, uz: p.uz, road: r })
    }
  }

  if (dash.length) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(dash, 3))
    geo.computeVertexNormals()
    group.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xefe6bf, flatShading: true, side: THREE.DoubleSide })))
  }

  // Even spatial spread first, then drop any pole that landed on another road,
  // then trim to the budget — so density is uniform and nothing sits mid-road.
  const spread = subsample(lamps, WORKING_LAMPS)
  const offRoad = spread.filter((l) => !onAnyRoad(l.x, l.z, segs))
  const kept = subsample(offRoad, MAX_LAMPS)
  if (kept.length) group.add(...buildLamps(kept, groundOf))
  if (signs.length) group.add(...buildSigns(signs, groundOf))
  return group
}

/** True if (x,z) lies on (or within a small margin of) any road carriageway. */
function onAnyRoad(x: number, z: number, segs: Seg[]): boolean {
  for (const s of segs) {
    const reach = s.hw + REJECT_MARGIN
    if (distToSeg2(x, z, s.ax, s.az, s.bx, s.bz) < reach * reach) return true
  }
  return false
}

function distToSeg2(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax
  const dz = bz - az
  const l2 = dx * dx + dz * dz
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0
  t = Math.max(0, Math.min(1, t))
  const ex = px - (ax + t * dx)
  const ez = pz - (az + t * dz)
  return ex * ex + ez * ez
}

/** Keep at most `max` items, evenly spaced through the array. */
function subsample<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items
  const stride = items.length / max
  const out: T[] = []
  for (let i = 0; out.length < max && Math.floor(i) < items.length; i += stride) out.push(items[Math.floor(i)])
  return out
}

/** Point + road unit direction + normal at arc-length `target` along a polyline. */
function pointAlong(
  points: Vec2[],
  target: number,
): { x: number; z: number; nx: number; nz: number; ux: number; uz: number } | null {
  let acc = 0
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const len = Math.hypot(dx, dz)
    if (len < 0.01) continue
    if (acc + len >= target) {
      const t = (target - acc) / len
      return { x: a.x + dx * t, z: a.z + dz * t, nx: -dz / len, nz: dx / len, ux: dx / len, uz: dz / len }
    }
    acc += len
  }
  return null
}

/**
 * One dashed centre-line quad, laid on the surface rather than hung over it.
 *
 * The height is sampled at EACH of the four corners, so a dash on a slope tilts
 * with the road and its far corners stay on the tarmac instead of lifting off.
 * `lift` is how far above the reported surface the paint sits: the ribbon's own
 * y-offset (so it clears the road, not the bare terrain under it) plus a hair to
 * beat z-fighting — small and constant, never the 0.18m that left bridge paint
 * floating above its deck.
 */
function emitDash(
  out: number[],
  ax: number,
  az: number,
  bx: number,
  bz: number,
  nx: number,
  nz: number,
  provider: ElevationProvider,
  lift: number,
): void {
  const y = (x: number, z: number): number => provider.heightAt(x, z) + lift
  const pts: [number, number][] = [
    [ax + nx * DASH_HW, az + nz * DASH_HW],
    [bx + nx * DASH_HW, bz + nz * DASH_HW],
    [bx - nx * DASH_HW, bz - nz * DASH_HW],
    [ax - nx * DASH_HW, az - nz * DASH_HW],
  ]
  const tri = (i: number, j: number, k: number): void => {
    for (const p of [pts[i], pts[j], pts[k]]) out.push(p[0], y(p[0], p[1]), p[1])
  }
  tri(0, 1, 2)
  tri(0, 2, 3)
}

/** Y-rotation that turns local +x to point along (dx,dz) on the ground. */
function yawToX(dx: number, dz: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(-dz, dx))
}
const UP = new THREE.Vector3(0, 1, 0)

/**
 * Street lamps: pole + arm over the road + a warm luminaire with a glowing lens,
 * plus a soft ground light-pool. Five instanced draw calls total.
 */
function buildLamps(lamps: Lamp[], groundOf: (roadIndex: number) => ElevationProvider): THREE.Object3D[] {
  const n = lamps.length
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.12, POLE_H, 6), POLE_MAT, n)
  const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(ARM_LEN, 0.09, 0.09), POLE_MAT, n)
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.2, 0.34), LUMINAIRE_MAT, n)
  const lenses = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.08, 0.26), LAMP_MAT, n)
  const pools = new THREE.InstancedMesh(softDisc(POOL_R), POOL_MAT, n)
  pools.frustumCulled = false

  const m = new THREE.Matrix4()
  const pos = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)
  const noRot = new THREE.Quaternion()
  for (let i = 0; i < n; i++) {
    const L = lamps[i]
    const g = groundOf(L.road).heightAt(L.x, L.z)
    // pole
    poles.setMatrixAt(i, m.compose(pos.set(L.x, g + POLE_H / 2, L.z), noRot, one))
    const q = yawToX(L.dx, L.dz)
    // arm: centred half-way along the reach, at the top of the pole
    const armX = L.x + L.dx * (ARM_LEN / 2)
    const armZ = L.z + L.dz * (ARM_LEN / 2)
    arms.setMatrixAt(i, m.compose(pos.set(armX, g + POLE_H - 0.05, armZ), q, one))
    // luminaire + lens at the arm's end, out over the road
    const hx = L.x + L.dx * ARM_LEN
    const hz = L.z + L.dz * ARM_LEN
    heads.setMatrixAt(i, m.compose(pos.set(hx, g + POLE_H - 0.12, hz), q, one))
    lenses.setMatrixAt(i, m.compose(pos.set(hx, g + POLE_H - 0.24, hz), q, one))
    // light pool on the ground under the luminaire
    pools.setMatrixAt(i, m.compose(pos.set(hx, groundOf(L.road).heightAt(hx, hz) + 0.06, hz), noRot, one))
  }
  for (const im of [poles, arms, heads, lenses, pools]) im.instanceMatrix.needsUpdate = true
  return [poles, arms, heads, lenses, pools]
}

/** A flat disc with a soft radial alpha falloff (bright centre → transparent rim). */
function softDisc(radius: number): THREE.BufferGeometry {
  const seg = 24
  const pos: number[] = [0, 0, 0]
  const col: number[] = [1, 1, 1, 1]
  const idx: number[] = []
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2
    pos.push(Math.cos(a) * radius, 0, Math.sin(a) * radius)
    col.push(1, 1, 1, 0)
    if (i > 0) idx.push(0, i, i + 1)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4))
  geo.setIndex(idx)
  return geo
}

/** Sparse roadside signs facing the road: post + green panel + white arrow. */
function buildSigns(signs: Sign[], groundOf: (roadIndex: number) => ElevationProvider): THREE.Object3D[] {
  const n = signs.length
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, 3.0, 6), SIGN_POST_MAT, n)
  const panels = new THREE.InstancedMesh(new THREE.BoxGeometry(1.7, 0.9, 0.08), SIGN_PANEL_MAT, n)
  const arrows = new THREE.InstancedMesh(arrowGeo(), SIGN_ARROW_MAT, n)

  const m = new THREE.Matrix4()
  const pos = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)
  const noRot = new THREE.Quaternion()
  for (let i = 0; i < n; i++) {
    const s = signs[i]
    const g = groundOf(s.road).heightAt(s.x, s.z)
    posts.setMatrixAt(i, m.compose(pos.set(s.x, g + 1.5, s.z), noRot, one))
    // face the panel along the road: local +z → road direction (ux,uz)
    const q = new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(s.ux, s.uz))
    panels.setMatrixAt(i, m.compose(pos.set(s.x, g + 2.8, s.z), q, one))
    arrows.setMatrixAt(i, m.compose(pos.set(s.x, g + 2.8, s.z), q, one))
  }
  for (const im of [posts, panels, arrows]) im.instanceMatrix.needsUpdate = true
  return [posts, panels, arrows]
}

/** A flat right-pointing arrow in the panel's local XY plane, proud of its face. */
function arrowGeo(): THREE.BufferGeometry {
  const z = 0.05 // proud of the 0.08-thick panel's front face
  const shaft = { x0: -0.55, x1: 0.15, hy: 0.12 }
  const head = { x1: 0.15, tip: 0.6, hy: 0.28 }
  const pos = [
    // shaft (two triangles)
    shaft.x0, -shaft.hy, z, shaft.x1, -shaft.hy, z, shaft.x1, shaft.hy, z,
    shaft.x0, -shaft.hy, z, shaft.x1, shaft.hy, z, shaft.x0, shaft.hy, z,
    // head (one triangle)
    head.x1, -head.hy, z, head.tip, 0, z, head.x1, head.hy, z,
  ]
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.computeVertexNormals()
  return geo
}
