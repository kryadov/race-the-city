import * as THREE from 'three'
import type { Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import { roomAt } from './area'

const WATER_OFFSET = 0.2 // sit just above the terrain basin

/** Half the map, in metres — RADIUS in `main.ts`, and all the ground there is. */
const MAP_HALF = 1000
/** How finely to sample a water body's bed. */
const PROBE_STEP = 40
/**
 * Which of the sampled bed heights to float the water at, low end first.
 *
 * Not the minimum: one stray sample in a dredged channel or a DEM artefact
 * would drop the whole surface below the bed and bury it. Not the middle
 * either, or the water sits over its own banks. A low quantile is the river.
 */
const BED_QUANTILE = 0.15

/**
 * The level to float a water body at: the bed it sits in, HERE.
 *
 * Sampling the centroid looks right for a pond and wrong for a river — a
 * winding river's centroid often falls outside the polygon entirely, on a bank
 * or a hill, and the whole surface then hangs in the air at that height.
 *
 * The lowest point on the outline was the answer to that, and it is wrong for
 * the same reason in reverse: an outline is not local. The Nile's polygon is 73
 * square kilometres and runs far past the map, so its lowest rim point is miles
 * downstream and well below the river beside Cairo — measured, not guessed:
 * level 8.28 against a bed of 9.4 to 41.7 inside the map. The water sat under
 * the ground for the whole city, and any boat on it sailed over the grass.
 *
 * So: sample the bed inside the outline and inside the map, and take a low
 * quantile of what is actually there.
 */
export function waterLevel(ring: Vec2[], provider: ElevationProvider): number {
  const bed: number[] = []
  for (let x = -MAP_HALF; x <= MAP_HALF; x += PROBE_STEP) {
    for (let z = -MAP_HALF; z <= MAP_HALF; z += PROBE_STEP) {
      if (roomAt(ring, x, z) > 0) bed.push(provider.heightAt(x, z))
    }
  }
  if (!bed.length) {
    // None of it is on the map — a pond smaller than the sampling step, or water
    // that only clips a corner. Its own outline is all there is to go on.
    let low = Infinity
    for (const p of ring) low = Math.min(low, provider.heightAt(p.x, p.z))
    return low + WATER_OFFSET
  }
  bed.sort((a, b) => a - b)
  return bed[Math.floor(bed.length * BED_QUANTILE)] + WATER_OFFSET
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
