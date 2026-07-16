import * as THREE from 'three'
import type { Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'

/**
 * Approximate sea for coastal areas: if the region has a coastline, lay one
 * big flat plane at the coastline's level. Land terrain (higher) hides it;
 * over the sea (terrain ≈ sea level) the blue shows through. A single quad —
 * negligible cost — and empty when there's no coast.
 */
export function buildSea(coast: Vec2[][], halfSize: number, provider: ElevationProvider): THREE.Object3D {
  const group = new THREE.Group()
  if (!coast.length) return group

  let level = Infinity
  for (const line of coast) {
    for (const p of line) {
      const h = provider.heightAt(p.x, p.z)
      if (h < level) level = h
    }
  }
  if (!Number.isFinite(level)) return group

  const geo = new THREE.PlaneGeometry(halfSize * 2, halfSize * 2)
  geo.rotateX(-Math.PI / 2)
  geo.translate(0, level + 0.3, 0)
  const mat = new THREE.MeshStandardMaterial({ color: 0x2f6db0, flatShading: true, transparent: true, opacity: 0.9 })
  group.add(new THREE.Mesh(geo, mat))
  return group
}
