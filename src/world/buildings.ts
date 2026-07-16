import * as THREE from 'three'
import type { Building, Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import { createFacadeMaterials, type FacadeMaterials } from './facade'
import { facadeUVs } from './facadeUv'
import { buildEntrances } from './entrances'

const COLORS = [0xcbb7a3, 0xbfae99, 0xd4c4b0, 0xc2b280, 0xb9a68f, 0xd8cab6, 0xc7b49c]
const RNG_SEED = 0x5ee7b1d // fixed seed → identical facades on every browser/reload

/** Deterministic PRNG (mulberry32), so building shades don't reshuffle per load. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Paint a building's vertices: roof (the extrude caps, material index 0) in a
 * darker, greyer tone than the walls (the sides, index 1). Baking this into a
 * colour attribute keeps every building at a single draw call while making
 * neighbouring blocks read as separate volumes instead of one beige mass.
 */
function paintVolume(geo: THREE.BufferGeometry, wall: THREE.Color, roof: THREE.Color): void {
  const count = geo.attributes.position.count
  const colors = new Float32Array(count * 3)
  for (const grp of geo.groups) {
    const c = grp.materialIndex === 0 ? roof : wall
    const end = Math.min(grp.start + grp.count, count)
    for (let i = grp.start; i < end; i++) {
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
}

/**
 * Extrudes each footprint from its ground level up by its height. Returns one
 * merged-material group of meshes and the flat footprints for the physics grid.
 */
export function buildBuildings(
  buildings: Building[],
  provider: ElevationProvider,
): { mesh: THREE.Object3D; footprints: Vec2[][]; facades: FacadeMaterials } {
  const group = new THREE.Group()
  const footprints: Vec2[][] = []
  const rng = makeRng(RNG_SEED)
  const wall = new THREE.Color()
  const roof = new THREE.Color()
  // Six materials for the whole city, one per class, rather than one each.
  const facades = createFacadeMaterials()

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

    // Jitter each facade off the palette so neighbours never share a shade, and
    // give the roof a darker, greyer tone so volumes read apart from the road.
    wall.setHex(COLORS[Math.floor(rng() * COLORS.length)])
    wall.offsetHSL((rng() - 0.5) * 0.04, (rng() - 0.5) * 0.12, (rng() - 0.5) * 0.16)
    roof.copy(wall).offsetHSL(0, -0.3, -0.17)
    paintVolume(geo, wall, roof)
    facadeUVs(geo, avg) // windows by the metre, roof aimed at the tile's plain strip
    group.add(new THREE.Mesh(geo, facades.of(b.kind)))
    footprints.push(b.footprint)
  }

  // Doors and signs for every building in two instanced draws.
  group.add(buildEntrances(buildings, provider))

  return { mesh: group, footprints, facades }
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
