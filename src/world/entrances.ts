import * as THREE from 'three'
import type { Building, BuildingKind, Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import { pointInPolygon } from '../physics/collide'

export interface Entrance {
  /** Where the door goes: on the ground, outside the wall, facing away from it. */
  x: number
  z: number
  angle: number // rotation about Y so the panel fronts the street
  kind: BuildingKind
}

/**
 * Door colour per class. A black slab read as a hole punched in the wall — these
 * are a painted timber door for homes, and glazing where the ground floor is a
 * shopfront.
 */
const DOOR_COLOR: Record<BuildingKind, number> = {
  house: 0x9a6a42, // varnished timber
  apartments: 0x7d8b9c, // painted communal door
  retail: 0x7ea6bd, // glass
  office: 0x86aabf, // glass
  civic: 0xa8814f, // heavy timber
  industrial: 0x9aa0a8, // steel shutter
}

/** Signage colour per class. Houses don't get a sign; industry gets a plain plate. */
const SIGN_COLOR: Partial<Record<BuildingKind, number>> = {
  retail: 0xe8434f,
  office: 0x3f7fd0,
  civic: 0x3fa06a,
  industrial: 0x8a8f98,
}

/** The longest edge of a footprint — the front, near enough, and the one a street sees. */
export function frontEdge(ring: Vec2[]): { a: Vec2; b: Vec2 } | null {
  if (ring.length < 3) return null
  let best = -1
  let a = ring[0]
  let b = ring[1]
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]
    const q = ring[(i + 1) % ring.length]
    const d = (p.x - q.x) ** 2 + (p.z - q.z) ** 2
    if (d > best) {
      best = d
      a = p
      b = q
    }
  }
  return best > 1 ? { a, b } : null // a metre-long wall has no front door
}

/**
 * Place one entrance per building, on the middle of its longest wall.
 *
 * The outward direction is found by trying one perpendicular and asking whether
 * it lands outside the footprint, rather than by trusting the ring's winding —
 * OSM ways come both ways round, and a door facing into the lobby is worse than
 * no door.
 */
export function entranceFor(b: Building): Entrance | null {
  const edge = frontEdge(b.footprint)
  if (!edge) return null
  const { a, b: q } = edge
  const mx = (a.x + q.x) / 2
  const mz = (a.z + q.z) / 2
  const dx = q.x - a.x
  const dz = q.z - a.z
  const len = Math.hypot(dx, dz)
  let nx = dz / len
  let nz = -dx / len
  if (pointInPolygon(mx + nx * 0.4, mz + nz * 0.4, b.footprint)) {
    nx = -nx
    nz = -nz
  }
  return {
    x: mx + nx * 0.08, // just proud of the wall, so it doesn't z-fight
    z: mz + nz * 0.08,
    angle: Math.atan2(nx, nz),
    kind: b.kind,
  }
}

/**
 * Doors and signs for the whole city in two instanced draws, rather than two
 * meshes per building. A city of 4000 buildings costs the same as one.
 */
export function buildEntrances(buildings: Building[], provider: ElevationProvider): THREE.Object3D {
  const group = new THREE.Group()
  const doors: Entrance[] = []
  const signs: Entrance[] = []
  for (const b of buildings) {
    const e = entranceFor(b)
    if (!e) continue
    doors.push(e)
    if (SIGN_COLOR[e.kind] && b.height > 4) signs.push(e)
  }
  if (!doors.length) return group

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const pos = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)
  const up = new THREE.Vector3(0, 1, 0)
  const col = new THREE.Color()

  const doorGeo = new THREE.BoxGeometry(1.3, 2.3, 0.1)
  doorGeo.translate(0, 1.15, 0) // sit on the ground, not through it
  const doorMesh = new THREE.InstancedMesh(
    doorGeo,
    new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true }),
    doors.length,
  )
  doors.forEach((e, i) => {
    q.setFromAxisAngle(up, e.angle)
    pos.set(e.x, provider.heightAt(e.x, e.z), e.z)
    doorMesh.setMatrixAt(i, m.compose(pos, q, one))
    col.setHex(DOOR_COLOR[e.kind])
    doorMesh.setColorAt(i, col)
  })
  doorMesh.instanceMatrix.needsUpdate = true
  if (doorMesh.instanceColor) doorMesh.instanceColor.needsUpdate = true
  group.add(doorMesh)

  if (signs.length) {
    const signGeo = new THREE.BoxGeometry(2.0, 0.55, 0.12)
    signGeo.translate(0, 3.1, 0) // above the door
    const signMesh = new THREE.InstancedMesh(
      signGeo,
      new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true }),
      signs.length,
    )
    signs.forEach((e, i) => {
      q.setFromAxisAngle(up, e.angle)
      pos.set(e.x, provider.heightAt(e.x, e.z), e.z)
      signMesh.setMatrixAt(i, m.compose(pos, q, one))
      col.setHex(SIGN_COLOR[e.kind]!)
      signMesh.setColorAt(i, col)
    })
    signMesh.instanceMatrix.needsUpdate = true
    if (signMesh.instanceColor) signMesh.instanceColor.needsUpdate = true
    group.add(signMesh)
  }
  return group
}
