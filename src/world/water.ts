import * as THREE from 'three'
import type { Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'

const WATER_OFFSET = 0.2 // sit just above the terrain basin

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

    let cx = 0
    let cz = 0
    for (const p of ring) {
      cx += p.x
      cz += p.z
    }
    const level = provider.heightAt(cx / ring.length, cz / ring.length) + WATER_OFFSET
    geo.translate(0, level, 0)

    group.add(new THREE.Mesh(geo, mat))
  }
  return group
}
