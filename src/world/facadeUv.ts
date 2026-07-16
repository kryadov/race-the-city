import * as THREE from 'three'
import { FLOOR_H, ROOF_UV, STOREYS_PER_TILE, TILE_SPAN } from './facade'

/** Storeys a building of this height has, at least one. */
export function storeysIn(height: number): number {
  return Math.max(1, Math.round(height / FLOOR_H))
}

/**
 * Lay facade UVs over an extruded building.
 *
 * Storeys are fitted to the building rather than stamped at a fixed 3.2m: a
 * whole number of them spans the wall exactly, so the roof never slices the top
 * row of windows in half. The stretch is at most half a storey, which reads as
 * generous or mean ceilings — believable either way.
 *
 * U is read from whichever ground axis a face fronts, so each wall reads along
 * its own length instead of being smeared diagonally.
 *
 * The roof caps are aimed at the tile's plain sliver: that is what lets the
 * whole building stay on a single material and one draw call.
 *
 * @param groundY the building's ground level — v counts storeys up from here
 * @param height the building's height above groundY
 */
export function facadeUVs(geo: THREE.BufferGeometry, groundY: number, height: number): void {
  const pos = geo.attributes.position
  const nor = geo.attributes.normal
  const uv = new Float32Array(pos.count * 2)
  const storeys = storeysIn(height)
  const floorH = height / storeys

  const groups = geo.groups.length
    ? geo.groups
    : [{ start: 0, count: pos.count, materialIndex: 1 }] // no groups: all wall

  for (const g of groups) {
    const end = Math.min(g.start + g.count, pos.count)
    for (let i = g.start; i < end; i++) {
      if (g.materialIndex === 0) {
        uv[i * 2] = ROOF_UV.u
        uv[i * 2 + 1] = ROOF_UV.v
        continue
      }
      const alongZ = Math.abs(nor.getX(i)) > Math.abs(nor.getZ(i))
      const u = alongZ ? pos.getZ(i) : pos.getX(i)
      uv[i * 2] = u / TILE_SPAN
      uv[i * 2 + 1] = (pos.getY(i) - groundY) / floorH / STOREYS_PER_TILE
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
}
