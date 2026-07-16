import * as THREE from 'three'
import type { Road, RoadKind, Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'

const WIDTHS: Record<RoadKind, number> = {
  motorway: 12, primary: 9, secondary: 7, residential: 5, service: 3.5, path: 2, other: 4,
}
const ROAD_Y_OFFSET = 0.15 // lift slightly above ground to avoid z-fighting

export function roadWidth(kind: RoadKind): number {
  return WIDTHS[kind]
}

/** Builds flat quad ribbons along each polyline, following terrain height. */
export function buildRoads(roads: Road[], provider: ElevationProvider): THREE.Object3D {
  const positions: number[] = []
  for (const road of roads) {
    const hw = roadWidth(road.kind) / 2
    for (let i = 0; i < road.points.length - 1; i++) {
      emitSegment(positions, road.points[i], road.points[i + 1], hw, provider)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.computeVertexNormals()
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a3a3f, flatShading: true, side: THREE.DoubleSide })
  return new THREE.Mesh(geo, mat)
}

function emitSegment(out: number[], a: Vec2, b: Vec2, hw: number, provider: ElevationProvider): void {
  const dx = b.x - a.x, dz = b.z - a.z
  const len = Math.hypot(dx, dz) || 1
  const nx = (-dz / len) * hw // perpendicular
  const nz = (dx / len) * hw
  const y = (v: Vec2) => provider.heightAt(v.x, v.z) + ROAD_Y_OFFSET
  const aL: Vec2 = { x: a.x + nx, z: a.z + nz }, aR: Vec2 = { x: a.x - nx, z: a.z - nz }
  const bL: Vec2 = { x: b.x + nx, z: b.z + nz }, bR: Vec2 = { x: b.x - nx, z: b.z - nz }
  push(out, aL, y(aL)); push(out, bL, y(bL)); push(out, bR, y(bR))
  push(out, aL, y(aL)); push(out, bR, y(bR)); push(out, aR, y(aR))
}

function push(out: number[], p: Vec2, y: number): void {
  out.push(p.x, y, p.z)
}
