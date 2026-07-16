import * as THREE from 'three'
import type { ElevationProvider } from '../terrain/provider'
import type { Vec2 } from '../geo/types'
import { pointInPolygon } from '../physics/collide'

const GROUND = new THREE.Color(0x5a7d4f)
const GREEN = new THREE.Color(0x4c7a42)

interface Box {
  ring: Vec2[]
  minX: number
  minZ: number
  maxX: number
  maxZ: number
}

/**
 * A halfSize*2 square ground mesh centered at the origin, displaced in Y by the
 * elevation provider. Vertices inside green (park) polygons are tinted green via
 * vertex colors, so greenery follows the terrain exactly with no extra geometry.
 */
export function buildGround(
  provider: ElevationProvider,
  halfSize: number,
  green: Vec2[][],
  segments = 128,
): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(halfSize * 2, halfSize * 2, segments, segments)
  geo.rotateX(-Math.PI / 2) // XY plane -> XZ ground plane
  const pos = geo.attributes.position as THREE.BufferAttribute

  const boxes: Box[] = green.map((ring) => {
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity
    for (const p of ring) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.z < minZ) minZ = p.z
      if (p.z > maxZ) maxZ = p.z
    }
    return { ring, minX, minZ, maxX, maxZ }
  })

  const colors = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    pos.setY(i, provider.heightAt(x, z))
    let c = GROUND
    for (const b of boxes) {
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ && pointInPolygon(x, z, b.ring)) {
        c = GREEN
        break
      }
    }
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  pos.needsUpdate = true
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true }))
}
