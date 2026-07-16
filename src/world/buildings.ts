import * as THREE from 'three'
import type { Building, Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'

const COLORS = [0xcbb7a3, 0xbfae99, 0xd4c4b0, 0xc2b280]

/**
 * Extrudes each footprint from its ground level up by its height. Returns one
 * merged-material group of meshes and the flat footprints for the physics grid.
 */
export function buildBuildings(
  buildings: Building[],
  provider: ElevationProvider,
): { mesh: THREE.Object3D; footprints: Vec2[][] } {
  const group = new THREE.Group()
  const footprints: Vec2[][] = []

  for (const b of buildings) {
    if (b.footprint.length < 3) continue
    const shape = new THREE.Shape()
    shape.moveTo(b.footprint[0].x, b.footprint[0].z)
    for (let i = 1; i < b.footprint.length; i++) shape.lineTo(b.footprint[i].x, b.footprint[i].z)
    shape.closePath()

    // Top sits at avg ground + height; the base is extended down to the lowest
    // ground under the footprint (+margin) so no side floats over a slope.
    const { avg, min } = groundStats(b.footprint, provider)
    const skirt = avg - min + 0.5
    const geo = new THREE.ExtrudeGeometry(shape, { depth: b.height + skirt, bevelEnabled: false })
    geo.rotateX(Math.PI / 2) // extrude along +Y without mirroring z
    geo.translate(0, avg + b.height, 0)

    const color = COLORS[footprints.length % COLORS.length]
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, flatShading: true, side: THREE.DoubleSide }))
    group.add(mesh)
    footprints.push(b.footprint)
  }

  return { mesh: group, footprints }
}

/** Average and minimum terrain height sampled at a footprint's vertices. */
export function groundStats(ring: Vec2[], provider: ElevationProvider): { avg: number; min: number } {
  let sum = 0
  let min = Infinity
  for (const p of ring) {
    const h = provider.heightAt(p.x, p.z)
    sum += h
    if (h < min) min = h
  }
  return { avg: sum / ring.length, min }
}
