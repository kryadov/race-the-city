import * as THREE from 'three'
import type { Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import { roomAt } from './area'

const WATER_OFFSET = 0.2 // sit just above the terrain basin
/**
 * How far the water's edge skirt hangs below the ground at the shoreline, metres.
 * A single flat surface over a sloping bank floats where the bank drops below its
 * level — you see daylight under the water's edge. A vertical skirt from the
 * perimeter down past the ground plugs that gap so the water meets the shore.
 */
const SKIRT_DROP = 1.5
/** How far the stone embankment's dry lip stands above the waterline, metres. */
const EMB_LIP = 0.5
/**
 * Embankment stone — a warm grey tuned to sit with the grass and tarmac (NOT red
 * brick), with a darker band below the waterline reading as a wet tide-mark, so a
 * body of water reads as a built, edged channel instead of bare water just sitting
 * there. Flat vertex colours, no texture — one extra mesh per body, cheap.
 */
const STONE_DRY = 0x8c857a
const STONE_WET = 0x5f5a52

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
  // The embankment: opaque stone, flat vertex colours (dry lip / wet tide-mark).
  const emb = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true })
  const dry = new THREE.Color(STONE_DRY)
  const wet = new THREE.Color(STONE_WET)

  for (const ring of water) {
    if (ring.length < 3) continue
    const level = waterLevel(ring, provider)

    const shape = new THREE.Shape()
    shape.moveTo(ring[0].x, ring[0].z)
    for (let i = 1; i < ring.length; i++) shape.lineTo(ring[i].x, ring[i].z)
    shape.closePath()

    const geo = new THREE.ShapeGeometry(shape)
    geo.rotateX(Math.PI / 2) // XY shape → XZ plane, z preserved (no mirror)
    geo.translate(0, level, 0)
    group.add(new THREE.Mesh(geo, mat))

    // A stone embankment around the perimeter: a low DRY lip above the waterline,
    // then a WET wall down past the ground so a surface over a sloping bank meets a
    // built edge instead of floating (bare water used to just "stand"). Two flat-
    // coloured bands — dry stone above the waterline, a darker wet band below it as
    // the tide-mark. Where the ground is already above the water it tucks under.
    const pos: number[] = []
    const col: number[] = []
    const push = (x: number, y: number, z: number, c: THREE.Color): void => {
      pos.push(x, y, z)
      col.push(c.r, c.g, c.b)
    }
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]
      const b = ring[(i + 1) % ring.length]
      const top = level + EMB_LIP
      const ab = Math.min(level, provider.heightAt(a.x, a.z)) - SKIRT_DROP
      const bb = Math.min(level, provider.heightAt(b.x, b.z)) - SKIRT_DROP
      // dry lip: waterline up to the top edge
      push(a.x, top, a.z, dry); push(b.x, top, b.z, dry); push(a.x, level, a.z, dry)
      push(b.x, top, b.z, dry); push(b.x, level, b.z, dry); push(a.x, level, a.z, dry)
      // wet wall: waterline down past the ground
      push(a.x, level, a.z, wet); push(b.x, level, b.z, wet); push(a.x, ab, a.z, wet)
      push(b.x, level, b.z, wet); push(b.x, bb, b.z, wet); push(a.x, ab, a.z, wet)
    }
    const embGeo = new THREE.BufferGeometry()
    embGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
    embGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3))
    embGeo.computeVertexNormals()
    group.add(new THREE.Mesh(embGeo, emb))
  }
  return group
}
