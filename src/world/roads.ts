import * as THREE from 'three'
import type { Road, RoadKind, Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'

const WIDTHS: Record<RoadKind, number> = {
  motorway: 12, primary: 9, secondary: 7, residential: 5, service: 3.5, path: 2, other: 4,
}
const ROAD_Y_OFFSET = 0.15 // lift slightly above ground to avoid z-fighting
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

/** Builds continuous mitered ribbons along each polyline, following terrain height. */
export function buildRoads(roads: Road[], provider: ElevationProvider): THREE.Object3D {
  const positions: number[] = []
  const y = (v: Vec2): number => provider.heightAt(v.x, v.z) + ROAD_Y_OFFSET
  for (const road of roads) {
    const sides = offsetsForPolyline(road.points, roadWidth(road.kind) / 2)
    for (let j = 0; j < sides.length - 1; j++) {
      const l0 = sides[j].left, r0 = sides[j].right
      const l1 = sides[j + 1].left, r1 = sides[j + 1].right
      push(positions, l0, y(l0)); push(positions, l1, y(l1)); push(positions, r1, y(r1))
      push(positions, l0, y(l0)); push(positions, r1, y(r1)); push(positions, r0, y(r0))
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.computeVertexNormals()
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a3a3f, flatShading: true, side: THREE.DoubleSide })
  return new THREE.Mesh(geo, mat)
}

function push(out: number[], p: Vec2, y: number): void {
  out.push(p.x, y, p.z)
}
