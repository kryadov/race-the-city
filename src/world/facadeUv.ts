import * as THREE from 'three'
import { BAY_W, FLOOR_H, ROOF_UV } from './facade'

/**
 * Lay facade UVs over an extruded building.
 *
 * Walls are mapped in metres — one tile per storey up, one per bay across — so
 * windows come out the same size on a bungalow and a tower. Which ground axis
 * feeds U is chosen per face from its normal, so each wall reads along its own
 * length instead of being smeared diagonally.
 *
 * The roof caps are aimed at the tile's plain top strip: that is what lets the
 * whole building stay on a single material, rather than splitting walls and roof
 * into two draw calls.
 *
 * @param groundY the building's ground level — v counts storeys up from here
 */
export function facadeUVs(geo: THREE.BufferGeometry, groundY: number): void {
  const pos = geo.attributes.position
  const nor = geo.attributes.normal
  const uv = new Float32Array(pos.count * 2)

  const groups = geo.groups.length
    ? geo.groups
    : [{ start: 0, count: pos.count, materialIndex: 1 }] // no groups: treat it all as wall

  for (const g of groups) {
    const end = Math.min(g.start + g.count, pos.count)
    for (let i = g.start; i < end; i++) {
      if (g.materialIndex === 0) {
        uv[i * 2] = ROOF_UV.u
        uv[i * 2 + 1] = ROOF_UV.v
        continue
      }
      // Wall: read along whichever ground axis the face fronts.
      const alongZ = Math.abs(nor.getX(i)) > Math.abs(nor.getZ(i))
      const u = alongZ ? pos.getZ(i) : pos.getX(i)
      uv[i * 2] = u / BAY_W
      uv[i * 2 + 1] = (pos.getY(i) - groundY) / FLOOR_H
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
}
