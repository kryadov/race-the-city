import * as THREE from 'three'
import type { ElevationProvider } from '../terrain/provider'

/**
 * A halfSize*2 square ground mesh centered at the origin, displaced in Y by the
 * elevation provider. `segments` controls resolution (verts per side = segments+1).
 */
export function buildGround(provider: ElevationProvider, halfSize: number, segments = 128): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(halfSize * 2, halfSize * 2, segments, segments)
  geo.rotateX(-Math.PI / 2) // XY plane -> XZ ground plane
  const pos = geo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    pos.setY(i, provider.heightAt(x, z))
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  const mat = new THREE.MeshStandardMaterial({ color: 0x5a7d4f, flatShading: true })
  return new THREE.Mesh(geo, mat)
}
