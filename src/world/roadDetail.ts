import * as THREE from 'three'
import type { Road, RoadKind, Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import { roadWidth } from './roads'

const DASH_KINDS = new Set<RoadKind>(['motorway', 'primary', 'secondary'])
const LAMP_KINDS = new Set<RoadKind>(['motorway', 'primary', 'secondary'])
const SIGN_KINDS = new Set<RoadKind>(['motorway', 'primary'])
const DASH_SPACING = 7
const DASH_LEN = 3.2
const DASH_HW = 0.16
const MAX_DASHES = 4000
const LAMP_SPACING = 34 // metres between lamps along a road
const MAX_LAMPS = 200 // network budget; extras are thinned out evenly
const POLE_H = 4.6
const SIGN_MIN_LEN = 90 // only sign roads at least this long
const MAX_SIGNS = 24

/** A lamp: pole foot position + the head position (atop the pole). */
interface Lamp {
  x: number
  z: number
}

/** A sign: post position + facing (unit vector along the road). */
interface Sign {
  x: number
  z: number
}

/**
 * Night-reactive lamp glow. One shared material for every lamp head; the render
 * loop sets its emissiveIntensity from how dark it is, so all lamps light up at
 * dusk with zero per-instance work.
 */
export const LAMP_MAT = new THREE.MeshStandardMaterial({
  color: 0x24200f,
  emissive: 0xffcf7a,
  emissiveIntensity: 0,
  flatShading: true,
})

/** Lightweight road dressing: dashed centre lines + evenly spaced street lamps + sparse signs. */
export function buildRoadDetail(roads: Road[], provider: ElevationProvider): THREE.Object3D {
  const group = new THREE.Group()
  const dash: number[] = []
  const lamps: Lamp[] = []
  const signs: Sign[] = []
  let dashes = 0

  for (let r = 0; r < roads.length; r++) {
    const road = roads[r]
    const wide = DASH_KINDS.has(road.kind)
    const lamped = LAMP_KINDS.has(road.kind)
    const signed = SIGN_KINDS.has(road.kind)
    if ((!wide && !lamped && !signed) || road.points.length < 2) continue
    const hw = roadWidth(road.kind) / 2
    // Lamps sit on a single side, alternating per road so a street isn't double-lined.
    const side = r % 2 === 0 ? 1 : -1
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
      roadLen += len
      const ux = dx / len
      const uz = dz / len
      const nx = -uz
      const nz = ux

      if (wide && dashes < MAX_DASHES) {
        let d = carryDash
        for (; d < len && dashes < MAX_DASHES; d += DASH_SPACING) {
          const e = Math.min(d + DASH_LEN, len)
          emitDash(dash, a.x + ux * d, a.z + uz * d, a.x + ux * e, a.z + uz * e, nx, nz, provider)
          dashes++
        }
        carryDash = d - len
      }

      if (lamped) {
        let d = carryLamp
        for (; d < len; d += LAMP_SPACING) {
          lamps.push({ x: a.x + ux * d + nx * side * (hw + 1.1), z: a.z + uz * d + nz * side * (hw + 1.1) })
        }
        carryLamp = d - len
      }
    }

    // One sign at ~35% along long arterials, on the opposite side to the lamps.
    if (signed && roadLen >= SIGN_MIN_LEN && signs.length < MAX_SIGNS) {
      const p = pointAlong(road.points, roadLen * 0.35)
      if (p) signs.push({ x: p.x - p.nx * side * (hw + 1.0), z: p.z - p.nz * side * (hw + 1.0) })
    }
  }

  if (dash.length) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(dash, 3))
    geo.computeVertexNormals()
    group.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xefe6bf, flatShading: true, side: THREE.DoubleSide })))
  }
  // Thin lamps down to the budget by sampling evenly across the whole network,
  // so density stays uniform instead of the first roads eating the entire cap.
  const kept = subsample(lamps, MAX_LAMPS)
  if (kept.length) group.add(...buildLamps(kept, provider))
  if (signs.length) group.add(...buildSigns(signs, provider))
  return group
}

/** Keep at most `max` items, evenly spaced through the array. */
function subsample<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items
  const stride = items.length / max
  const out: T[] = []
  for (let i = 0; out.length < max && Math.floor(i) < items.length; i += stride) out.push(items[Math.floor(i)])
  return out
}

/** Point (and road normal) at arc-length `target` along a polyline. */
function pointAlong(points: Vec2[], target: number): { x: number; z: number; nx: number; nz: number } | null {
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
      return { x: a.x + dx * t, z: a.z + dz * t, nx: -dz / len, nz: dx / len }
    }
    acc += len
  }
  return null
}

function emitDash(
  out: number[],
  ax: number,
  az: number,
  bx: number,
  bz: number,
  nx: number,
  nz: number,
  provider: ElevationProvider,
): void {
  const y = (x: number, z: number): number => provider.heightAt(x, z) + 0.18
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

/** Street lamps: a thin pole plus a glowing head (2 draw calls, night-reactive). */
function buildLamps(lamps: Lamp[], provider: ElevationProvider): THREE.Object3D[] {
  const poles = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.08, 0.11, POLE_H, 5),
    new THREE.MeshStandardMaterial({ color: 0x8f9298, flatShading: true }),
    lamps.length,
  )
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.28, 0.5), LAMP_MAT, lamps.length)
  const m = new THREE.Matrix4()
  for (let i = 0; i < lamps.length; i++) {
    const g = provider.heightAt(lamps[i].x, lamps[i].z)
    m.makeTranslation(lamps[i].x, g + POLE_H / 2, lamps[i].z)
    poles.setMatrixAt(i, m)
    m.makeTranslation(lamps[i].x, g + POLE_H + 0.05, lamps[i].z)
    heads.setMatrixAt(i, m)
  }
  poles.instanceMatrix.needsUpdate = true
  heads.instanceMatrix.needsUpdate = true
  return [poles, heads]
}

/** Sparse roadside signs: a post plus a green panel (2 draw calls). */
function buildSigns(signs: Sign[], provider: ElevationProvider): THREE.Object3D[] {
  const posts = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.06, 0.06, 3.0, 5),
    new THREE.MeshStandardMaterial({ color: 0x74777d, flatShading: true }),
    signs.length,
  )
  const panels = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1.6, 0.9, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x2f7d3b, flatShading: true }),
    signs.length,
  )
  const m = new THREE.Matrix4()
  for (let i = 0; i < signs.length; i++) {
    const g = provider.heightAt(signs[i].x, signs[i].z)
    m.makeTranslation(signs[i].x, g + 1.5, signs[i].z)
    posts.setMatrixAt(i, m)
    m.makeTranslation(signs[i].x, g + 2.8, signs[i].z)
    panels.setMatrixAt(i, m)
  }
  posts.instanceMatrix.needsUpdate = true
  panels.instanceMatrix.needsUpdate = true
  return [posts, panels]
}
