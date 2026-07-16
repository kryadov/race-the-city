import * as THREE from 'three'
import type { Building, BuildingKind, Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import { createFacadeMaterials, type FacadeMaterials } from './facade'
import { facadeUVs } from './facadeUv'
import { buildEntrances } from './entrances'

// A tight range of warm stones. Neighbours should read apart without the street
// turning into a patchwork — the eye notices the outlines, not the palette.
const COLORS = [0xcbbdaa, 0xc6b7a4, 0xd0c3b2, 0xc9bba9, 0xccbfad]
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

/** Vertex data piling up for one building class, before it is merged. */
interface Batch {
  pos: number[]
  nor: number[]
  col: number[]
  uv: number[]
}

const newBatch = (): Batch => ({ pos: [], nor: [], col: [], uv: [] })

function appendTo(batch: Batch, geo: THREE.BufferGeometry): void {
  const push = (dst: number[], attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): void => {
    const a = attr.array as ArrayLike<number>
    for (let i = 0; i < a.length; i++) dst.push(a[i])
  }
  push(batch.pos, geo.attributes.position)
  push(batch.nor, geo.attributes.normal)
  push(batch.col, geo.attributes.color)
  push(batch.uv, geo.attributes.uv)
}

function batchMesh(batch: Batch, mat: THREE.Material): THREE.Mesh {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(batch.pos, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(batch.nor, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(batch.col, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(batch.uv, 2))
  return new THREE.Mesh(geo, mat)
}

/**
 * Extrudes each footprint from its ground level up by its height, and merges the
 * lot into one mesh per building class.
 *
 * A mesh each meant a draw call each — around 470 for a couple of kilometres of
 * central St Petersburg, and again for the shadow pass. Merging costs nothing
 * visually: every building's geometry is already baked in world space with an
 * identity transform, its colour lives in a vertex attribute and its facade in
 * the UVs, so the only thing a separate mesh was buying was the draw call.
 *
 * The UVs must be laid before merging: facadeUVs tells roof from wall by the
 * extrude groups, and merging throws those away.
 *
 * Returns the merged group, the flat footprints for the physics grid, and the
 * facade materials so the caller can light the windows and dispose them.
 */
export function buildBuildings(
  buildings: Building[],
  provider: ElevationProvider,
): { mesh: THREE.Object3D; footprints: Vec2[][]; tops: number[]; facades: FacadeMaterials } {
  const group = new THREE.Group()
  const footprints: Vec2[][] = []
  // The absolute height of each roof, parallel to `footprints`: what the physics
  // needs to tell a car flying over a bungalow from one flying into a tower.
  const tops: number[] = []
  const rng = makeRng(RNG_SEED)
  const wall = new THREE.Color()
  const roof = new THREE.Color()
  // Six materials for the whole city, one per class, rather than one each.
  const facades = createFacadeMaterials()
  const batches = new Map<BuildingKind, Batch>()

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
    wall.offsetHSL((rng() - 0.5) * 0.015, (rng() - 0.5) * 0.05, (rng() - 0.5) * 0.06)
    roof.copy(wall).offsetHSL(0, -0.22, -0.12)
    paintVolume(geo, wall, roof)
    // Storeys fitted to this building, so the roof never slices a window row.
    facadeUVs(geo, avg, b.height)

    let batch = batches.get(b.kind)
    if (!batch) {
      batch = newBatch()
      batches.set(b.kind, batch)
    }
    appendTo(batch, geo)
    geo.dispose() // its vertices live in the batch now
    footprints.push(b.footprint)
    tops.push(avg + b.height)
  }

  for (const [kind, batch] of batches) group.add(batchMesh(batch, facades.of(kind)))

  // Doors and signs for every building in two instanced draws.
  group.add(buildEntrances(buildings, provider))

  return { mesh: group, footprints, tops, facades }
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
