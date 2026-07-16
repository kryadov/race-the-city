import * as THREE from 'three'
import type { Railway, Road, RoadKind, Vec2 } from '../geo/types'
import { densify } from './polyline'
import type { ElevationProvider } from '../terrain/provider'

const WIDTHS: Record<RoadKind, number> = {
  motorway: 12, primary: 9, secondary: 7, residential: 5, service: 3.5, path: 2, other: 4,
}
const ROAD_Y_OFFSET = 0.15 // lift slightly above ground to avoid z-fighting
/**
 * A ribbon vertex at least this often, in metres.
 *
 * The ribbon takes its height at its vertices and stretches flat between them.
 * OSM's are as sparse as it can manage — 28% of Monaco's road segments are
 * longer than the terrain grid's own cell, the longest 160m — so without this
 * the road is a chord over the ground and the car, which follows the ground,
 * ends up under its own road.
 */
const RIBBON_STEP = 5
const MITER_LIMIT = 4 // cap the joint stretch so sharp turns don't spike

export function roadWidth(kind: RoadKind): number {
  return WIDTHS[kind]
}

export interface RibbonSide {
  left: Vec2
  right: Vec2
}

/**
 * Left/right edge points for each vertex of a polyline, mitered at joints so
 * consecutive segments share their joint vertices — no gaps/overlaps at turns.
 * Endpoints use the plain segment normal; interior vertices use the averaged
 * normal scaled by 1/cos(half-angle), clamped by MITER_LIMIT for sharp turns.
 */
export function offsetsForPolyline(points: Vec2[], hw: number): RibbonSide[] {
  if (points.length < 2) return []
  const seg: Vec2[] = [] // per-segment unit normal (left of travel)
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x
    const dz = points[i + 1].z - points[i].z
    const len = Math.hypot(dx, dz) || 1
    seg.push({ x: -dz / len, z: dx / len })
  }

  const out: RibbonSide[] = []
  for (let j = 0; j < points.length; j++) {
    let mx: number, mz: number, scale: number
    if (j === 0) {
      ;({ x: mx, z: mz } = seg[0])
      scale = 1
    } else if (j === points.length - 1) {
      ;({ x: mx, z: mz } = seg[seg.length - 1])
      scale = 1
    } else {
      const a = seg[j - 1]
      const b = seg[j]
      const sx = a.x + b.x
      const sz = a.z + b.z
      const slen = Math.hypot(sx, sz)
      if (slen < 1e-4) {
        // ~180° reversal: fall back to the outgoing segment normal
        ;({ x: mx, z: mz } = b)
        scale = 1
      } else {
        mx = sx / slen
        mz = sz / slen
        const cos = mx * b.x + mz * b.z // cos(half-angle) between miter and segment normal
        scale = 1 / Math.max(cos, 1 / MITER_LIMIT)
      }
    }
    const ox = mx * hw * scale
    const oz = mz * hw * scale
    const p = points[j]
    out.push({ left: { x: p.x + ox, z: p.z + oz }, right: { x: p.x - ox, z: p.z - oz } })
  }
  return out
}

export interface RoadStyle {
  lift?: number // raise the ribbon (bridges)
  color?: number
}

/** Builds continuous mitered ribbons along each road, following terrain height. */
export function buildRoads(roads: Road[], provider: ElevationProvider, style: RoadStyle = {}): THREE.Object3D {
  const lift = style.lift ?? 0
  const positions: number[] = []
  const y = (v: Vec2): number => provider.heightAt(v.x, v.z) + ROAD_Y_OFFSET + lift
  for (const road of roads) {
    emitRibbon(positions, offsetsForPolyline(densify(road.points, RIBBON_STEP), roadWidth(road.kind) / 2), y)
  }
  return ribbonMesh(positions, style.color ?? 0x5b5c62) // tarmac grey, not a hole in the ground
}

/** Standard gauge, rail centre to rail centre. */
const GAUGE = 1.435
const RAIL_W = 0.09 // the railhead you can actually see
const BALLAST_W = 3.0 // the stones the sleepers sit in
const SLEEPER_GAP = 0.65 // metres between sleepers
const BALLAST_Y = 0.06
const SLEEPER_Y = 0.11
/** Top of the rail — what a wheel sits on. Trains read this. */
export const RAILHEAD_Y = 0.18

/** The ribbon between two offsets of a line: a rail, rather than the whole track. */
function bandBetween(points: Vec2[], from: number, to: number): RibbonSide[] {
  const outer = offsetsForPolyline(points, Math.max(from, to))
  const inner = offsetsForPolyline(points, Math.min(from, to))
  const left: RibbonSide[] = []
  for (let i = 0; i < outer.length; i++) left.push({ left: outer[i].left, right: inner[i].left })
  return left
}

/** The same, on the other side of the line. */
function bandBetweenRight(points: Vec2[], from: number, to: number): RibbonSide[] {
  const outer = offsetsForPolyline(points, Math.max(from, to))
  const inner = offsetsForPolyline(points, Math.min(from, to))
  const right: RibbonSide[] = []
  for (let i = 0; i < outer.length; i++) right.push({ left: inner[i].right, right: outer[i].right })
  return right
}

/** Points every `gap` metres along a line, with the bearing there. */
function tiesAlong(points: Vec2[], gap: number): { x: number; z: number; angle: number }[] {
  const out: { x: number; z: number; angle: number }[] = []
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    const n = Math.floor(len / gap)
    const angle = Math.atan2(b.z - a.z, b.x - a.x)
    for (let k = 0; k < n; k++) {
      const f = (k * gap) / len
      out.push({ x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, angle })
    }
  }
  return out
}

/**
 * Railway track: ballast, sleepers and two rails at standard gauge.
 *
 * It was one dark ribbon 2.6m wide — the width of a small road, and about as
 * convincing. A track is two 9cm rails 1.435m apart; that is what you see, and
 * the gaps between the sleepers are most of what makes it read as track at all.
 *
 * Tunnels are skipped: they run under the city, and drawing them on the surface
 * lays track through people's front rooms. Monaco's railway is tunnelled end to
 * end — all eleven ways of it.
 */
export function buildRailways(railways: Railway[], provider: ElevationProvider): THREE.Object3D {
  const group = new THREE.Group()
  const ballast: number[] = []
  const rails: number[] = []
  const ties: { x: number; z: number; angle: number }[] = []

  for (const line of railways) {
    if (line.tunnel) continue
    const pts = densify(line.points, RIBBON_STEP)
    emitRibbon(ballast, offsetsForPolyline(pts, BALLAST_W / 2), (v) => provider.heightAt(v.x, v.z) + BALLAST_Y)
    const railY = (v: Vec2): number => provider.heightAt(v.x, v.z) + RAILHEAD_Y
    emitRibbon(rails, bandBetween(pts, GAUGE / 2 - RAIL_W / 2, GAUGE / 2 + RAIL_W / 2), railY)
    emitRibbon(rails, bandBetweenRight(pts, GAUGE / 2 - RAIL_W / 2, GAUGE / 2 + RAIL_W / 2), railY)
    ties.push(...tiesAlong(pts, SLEEPER_GAP))
  }

  if (ballast.length) group.add(ribbonMesh(ballast, 0x6b6259))
  if (rails.length) group.add(ribbonMesh(rails, 0x9aa0a8))

  if (ties.length) {
    // One instanced draw for every sleeper in the city.
    const geo = new THREE.BoxGeometry(0.24, 0.1, GAUGE + 0.5)
    const mesh = new THREE.InstancedMesh(
      geo,
      new THREE.MeshStandardMaterial({ color: 0x4a3b2c, flatShading: true }),
      ties.length,
    )
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const p = new THREE.Vector3()
    const one = new THREE.Vector3(1, 1, 1)
    const up = new THREE.Vector3(0, 1, 0)
    ties.forEach((t, i) => {
      q.setFromAxisAngle(up, -t.angle)
      p.set(t.x, provider.heightAt(t.x, t.z) + SLEEPER_Y, t.z)
      mesh.setMatrixAt(i, m.compose(p, q, one))
    })
    mesh.instanceMatrix.needsUpdate = true
    group.add(mesh)
  }
  return group
}

/**
 * @param y height for an edge vertex. `i` is the index of the polyline point it
 *   came from — the vertex itself is offset out to the road's edge, so its
 *   coordinates are NOT the polyline point's, and anything keyed on position
 *   will not find it.
 */
export function emitRibbon(out: number[], sides: RibbonSide[], y: (v: Vec2, i: number) => number): void {
  for (let j = 0; j < sides.length - 1; j++) {
    const l0 = sides[j].left, r0 = sides[j].right
    const l1 = sides[j + 1].left, r1 = sides[j + 1].right
    push(out, l0, y(l0, j)); push(out, l1, y(l1, j + 1)); push(out, r1, y(r1, j + 1))
    push(out, l0, y(l0, j)); push(out, r1, y(r1, j + 1)); push(out, r0, y(r0, j))
  }
}

export function ribbonMesh(positions: number[], color: number): THREE.Mesh {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.computeVertexNormals()
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, flatShading: true, side: THREE.DoubleSide }))
}

function push(out: number[], p: Vec2, y: number): void {
  out.push(p.x, y, p.z)
}
