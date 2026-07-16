import * as THREE from 'three'
import type { Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import { pointInPolygon } from '../physics/collide'

const SURFACE_Y = 0.12 // just over the ground
const PAINT_Y = 0.16 // and the paint just over that
const BAY_W = 2.5 // a parking space, metres
const BAY_L = 5.0

/** Longest-edge direction of a ring — parking bays run square to the kerb. */
export function ringAngle(ring: Vec2[]): number {
  let best = -1
  let angle = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const d = (a.x - b.x) ** 2 + (a.z - b.z) ** 2
    if (d > best) {
      best = d
      angle = Math.atan2(b.z - a.z, b.x - a.x)
    }
  }
  return angle
}

export interface Bay {
  x: number
  z: number
}

/**
 * Lay bays across a parking area: a grid square to its longest edge, keeping
 * only the lines that actually land inside it. Rows are spaced two bays plus an
 * aisle, so cars back out into something.
 */
export function bayLines(ring: Vec2[], limit = 400): Bay[] {
  const angle = ringAngle(ring)
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  // Work in the ring's own frame, then rotate back.
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
  for (const p of ring) {
    const u = p.x * cos + p.z * sin
    const v = -p.x * sin + p.z * cos
    if (u < minU) minU = u
    if (u > maxU) maxU = u
    if (v < minV) minV = v
    if (v > maxV) maxV = v
  }

  const bays: Bay[] = []
  const rowPitch = BAY_L * 2 + 6 // two ranks nose-to-nose, plus an aisle
  for (let v = minV + BAY_L / 2; v <= maxV && bays.length < limit; v += rowPitch) {
    for (const rank of [0, BAY_L]) {
      const vv = v + rank
      if (vv > maxV) continue
      for (let u = minU + BAY_W / 2; u <= maxU && bays.length < limit; u += BAY_W) {
        const x = u * cos - vv * sin
        const z = u * sin + vv * cos
        if (pointInPolygon(x, z, ring)) bays.push({ x, z })
      }
    }
  }
  return bays
}

/**
 * Parking areas: tarmac, with bay markings.
 *
 * The markings are one instanced draw for every bay in the city rather than a
 * mesh each — a retail park's 300 spaces cost the same as one.
 */
export function buildParking(parking: Vec2[][], provider: ElevationProvider): THREE.Object3D {
  const group = new THREE.Group()
  if (!parking.length) return group

  const tarmac = new THREE.MeshStandardMaterial({ color: 0x35353c, flatShading: true })
  const allBays: { bay: Bay; angle: number }[] = []

  for (const ring of parking) {
    if (ring.length < 3) continue
    const shape = new THREE.Shape()
    shape.moveTo(ring[0].x, ring[0].z)
    for (let i = 1; i < ring.length; i++) shape.lineTo(ring[i].x, ring[i].z)
    shape.closePath()
    const geo = new THREE.ShapeGeometry(shape)
    geo.rotateX(Math.PI / 2) // XY shape → XZ ground plane, z preserved

    // Drape it: a flat slab would sink through a sloping car park.
    const pos = geo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, provider.heightAt(pos.getX(i), pos.getZ(i)) + SURFACE_Y)
    }
    pos.needsUpdate = true
    geo.computeVertexNormals()
    group.add(new THREE.Mesh(geo, tarmac))

    const angle = ringAngle(ring)
    for (const bay of bayLines(ring)) allBays.push({ bay, angle })
  }

  if (allBays.length) {
    // One thin stripe per bay divider.
    const lineGeo = new THREE.BoxGeometry(0.12, 0.02, BAY_L * 0.9)
    const lineMesh = new THREE.InstancedMesh(
      lineGeo,
      new THREE.MeshStandardMaterial({ color: 0xd8d8cc, flatShading: true }),
      allBays.length,
    )
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const p = new THREE.Vector3()
    const one = new THREE.Vector3(1, 1, 1)
    const up = new THREE.Vector3(0, 1, 0)
    allBays.forEach(({ bay, angle }, i) => {
      q.setFromAxisAngle(up, -angle)
      p.set(bay.x, provider.heightAt(bay.x, bay.z) + PAINT_Y, bay.z)
      lineMesh.setMatrixAt(i, m.compose(p, q, one))
    })
    lineMesh.instanceMatrix.needsUpdate = true
    group.add(lineMesh)
  }
  return group
}
