import * as THREE from 'three'
import type { Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'

const WATER_OFFSET = 0.2 // sit just above the terrain basin

/**
 * The level to float a water body at: the lowest terrain under its outline.
 *
 * Sampling the centroid instead looks right for a pond and wrong for a river —
 * a winding river's centroid often falls outside the polygon entirely, on a
 * bank or a hill, and the whole surface then hangs in the air at that height.
 * The lowest point on the outline is always in the basin the water sits in.
 */
export function waterLevel(ring: Vec2[], provider: ElevationProvider): number {
  let low = Infinity
  for (const p of ring) low = Math.min(low, provider.heightAt(p.x, p.z))
  return low + WATER_OFFSET
}

/** Flat filled polygons for water bodies, placed at each body's terrain level. */
export function buildWater(water: Vec2[][], provider: ElevationProvider): THREE.Object3D {
  const group = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({
    color: 0x2f6db0,
    flatShading: true,
    transparent: true,
    opacity: 0.86,
    side: THREE.DoubleSide,
  })

  for (const ring of water) {
    if (ring.length < 3) continue
    const shape = new THREE.Shape()
    shape.moveTo(ring[0].x, ring[0].z)
    for (let i = 1; i < ring.length; i++) shape.lineTo(ring[i].x, ring[i].z)
    shape.closePath()

    const geo = new THREE.ShapeGeometry(shape)
    geo.rotateX(Math.PI / 2) // XY shape → XZ plane, z preserved (no mirror)
    geo.translate(0, waterLevel(ring, provider), 0)

    group.add(new THREE.Mesh(geo, mat))
  }
  return group
}
