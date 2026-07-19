import * as THREE from 'three'
import type { ElevationProvider } from '../terrain/provider'
import type { Surface, SurfaceKind, Vec2 } from '../geo/types'
import { pointInPolygon } from '../physics/collide'

const GROUND = new THREE.Color(0x5a7d4f)
const GREEN = new THREE.Color(0x4c7a42)

/**
 * Flat land-use tints, each a single vertex colour painted over the base ground —
 * no extra geometry and no extra draw (they ride the one ground mesh), and (like
 * GREEN) they pass through the neon-mode ground multiply in theme.ts unchanged.
 * Farmland warm khaki, meadow light green, orchard mid green, built-up warm grey —
 * all kept clear of GROUND and GREEN so each area reads as its own colour.
 */
export const SURFACE_COLORS: Record<SurfaceKind, THREE.Color> = {
  farmland: new THREE.Color(0xbdaa6a),
  meadow: new THREE.Color(0x83b25c),
  orchard: new THREE.Color(0x5c8a44),
  residential: new THREE.Color(0x8f877b),
}

interface Box {
  ring: Vec2[]
  minX: number
  minZ: number
  maxX: number
  maxZ: number
  color: THREE.Color
}

/** A ring plus its axis-aligned bounds and paint colour — the bounds are a cheap
 * reject before the per-vertex point-in-polygon test. */
function boundBox(ring: Vec2[], color: THREE.Color): Box {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity
  for (const p of ring) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.z < minZ) minZ = p.z
    if (p.z > maxZ) maxZ = p.z
  }
  return { ring, minX, minZ, maxX, maxZ, color }
}

/**
 * A halfSize*2 square ground mesh centered at the origin, displaced in Y by the
 * elevation provider. Vertices inside a land-use `surface` (farmland, meadow,
 * orchard, built-up land) or a green (park) polygon are tinted via vertex colors,
 * so every area follows the terrain exactly with no extra geometry or draw calls.
 *
 * Surfaces are tested before green so their distinct tint wins where one overlaps
 * a park lawn — a scrub is both greenery and an orchard-tinted surface, and the
 * more specific land-use colour is the one to keep.
 */
export function buildGround(
  provider: ElevationProvider,
  halfSize: number,
  green: Vec2[][],
  surfaces: Surface[] = [],
  segments = 128,
): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(halfSize * 2, halfSize * 2, segments, segments)
  geo.rotateX(-Math.PI / 2) // XY plane -> XZ ground plane
  const pos = geo.attributes.position as THREE.BufferAttribute

  // Surfaces first, park green after: first match wins, so the order is the
  // priority. Both fold into the one boxes list — a single per-vertex scan.
  const boxes: Box[] = [
    ...surfaces.map((s) => boundBox(s.ring, SURFACE_COLORS[s.kind])),
    ...green.map((ring) => boundBox(ring, GREEN)),
  ]

  const colors = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    pos.setY(i, provider.heightAt(x, z))
    let c = GROUND
    for (const b of boxes) {
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ && pointInPolygon(x, z, b.ring)) {
        c = b.color
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
