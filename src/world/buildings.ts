import * as THREE from 'three'
import type { Building, BuildingKind, Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import { BAY_W, createFacadeMaterials, type FacadeMaterials } from './facade'
import { facadeUVs, storeysIn } from './facadeUv'
import { buildEntrances } from './entrances'
import { snowed } from './ground'
import { pointInPolygon } from '../physics/collide'

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

/**
 * Split every wall quad at the ground floor (Y = groundY) into a facade band
 * above and a plinth band below, the plinth in its own group (material index 2).
 *
 * ExtrudeGeometry runs each wall as a SINGLE quad from the base straight to the
 * roof, with no vertex at the ground floor. facadeUVs counts storeys up from
 * groundY, so on a slope — where the base drops to the lowest corner well below
 * groundY — every wall vertex under the ground floor lands at a negative v and
 * the window texture, set to repeat, wraps DOWNWARD: rows of windows striping
 * the whole plinth, taller and more striped the bigger the sloped footprint.
 *
 * Cutting the quad gives the plinth its own vertices and its own group, which
 * facadeUVs then aims at the plain sliver — a solid base, windows only above.
 * The facade band keeps the extrude's exact vertices, normals and winding, so
 * anything above the ground floor (and every building on the flat) is untouched.
 *
 * The extrude lays each wall as six vertices — a = Pj·top, b = Pk·top,
 * d = Pj·base, then b, c = Pk·base, d — so a quad's four corners sit at local
 * offsets 0, 1, 2 and 4, all sharing one flat outward normal.
 */
function splitPlinth(geo: THREE.BufferGeometry, groundY: number): void {
  const pos = geo.attributes.position
  const nor = geo.attributes.normal
  const cap: number[] = []
  const capN: number[] = []
  const facade: number[] = []
  const facadeN: number[] = []
  const plinth: number[] = []
  const plinthN: number[] = []

  const emit = (
    p: number[], n: number[],
    x: number, y: number, z: number,
    nx: number, ny: number, nz: number,
  ): void => {
    p.push(x, y, z)
    n.push(nx, ny, nz)
  }

  for (const g of geo.groups) {
    const end = g.start + g.count
    if (g.materialIndex === 0) {
      // Roof and floor caps pass straight through.
      for (let i = g.start; i < end; i++) {
        emit(cap, capN, pos.getX(i), pos.getY(i), pos.getZ(i), nor.getX(i), nor.getY(i), nor.getZ(i))
      }
      continue
    }
    for (let s = g.start; s + 6 <= end; s += 6) {
      const nx = nor.getX(s)
      const ny = nor.getY(s)
      const nz = nor.getZ(s) // one flat normal for the whole quad
      const jtx = pos.getX(s), jty = pos.getY(s), jtz = pos.getZ(s) // Pj top
      const ktx = pos.getX(s + 1), kty = pos.getY(s + 1), ktz = pos.getZ(s + 1) // Pk top
      const jbx = pos.getX(s + 2), jbz = pos.getZ(s + 2) // Pj base
      const kbx = pos.getX(s + 4), kbz = pos.getZ(s + 4) // Pk base
      const jbY = pos.getY(s + 2) // base Y (same for both corners)
      // The two rings the cut introduces, seated at the ground floor.
      const jmx = jtx, jmz = jtz
      const kmx = ktx, kmz = ktz
      // Facade band: the extrude's two triangles with their bases raised to the
      // ground floor, so the winding — and the outward normal — is unchanged.
      emit(facade, facadeN, jtx, jty, jtz, nx, ny, nz)
      emit(facade, facadeN, ktx, kty, ktz, nx, ny, nz)
      emit(facade, facadeN, jmx, groundY, jmz, nx, ny, nz)
      emit(facade, facadeN, ktx, kty, ktz, nx, ny, nz)
      emit(facade, facadeN, kmx, groundY, kmz, nx, ny, nz)
      emit(facade, facadeN, jmx, groundY, jmz, nx, ny, nz)
      // Plinth band: the same quad from the ground floor down to the base.
      emit(plinth, plinthN, jmx, groundY, jmz, nx, ny, nz)
      emit(plinth, plinthN, kmx, groundY, kmz, nx, ny, nz)
      emit(plinth, plinthN, jbx, jbY, jbz, nx, ny, nz)
      emit(plinth, plinthN, kmx, groundY, kmz, nx, ny, nz)
      emit(plinth, plinthN, kbx, jbY, kbz, nx, ny, nz)
      emit(plinth, plinthN, jbx, jbY, jbz, nx, ny, nz)
    }
  }

  geo.setAttribute('position', new THREE.Float32BufferAttribute(cap.concat(facade, plinth), 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(capN.concat(facadeN, plinthN), 3))
  geo.deleteAttribute('uv') // stale after the cut; facadeUVs lays fresh ones
  const capV = cap.length / 3
  const facadeV = facade.length / 3
  const plinthV = plinth.length / 3
  geo.clearGroups()
  geo.addGroup(0, capV, 0) // roof + floor caps
  geo.addGroup(capV, facadeV, 1) // facade, windowed
  geo.addGroup(capV + facadeV, plinthV, 2) // plinth, solid
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

// Which classes trade at street level: shops and services glaze the ground
// floor, homes/offices/sheds keep the plain facade the texture already gives them.
const SHOPFRONT_KINDS = new Set<BuildingKind>(['retail', 'civic'])
const SHOPFRONT_OFFSET = 0.06 // how proud of the wall the glazing stands, no z-fight
const SHOPFRONT_MAX_H = 4.5 // tallest a band gets, however generous the ceiling

/**
 * One glazed shopfront bay, drawn once and shared by every pane in the city.
 *
 * The dark ground shows through as the frame and the mullion between the two
 * lights; a bright, cool fill is the glass — brighter than a home's window
 * texture, so a shop reads as a shop; a solid band along the bottom is the stall
 * riser at the pavement, and a darker board along the top is the fascia a sign
 * hangs off. Kept to the stubbable canvas ops (fillRect only) so the node tests
 * that stand in a fake 2D context don't have to grow gradients to build a city.
 */
let shopfrontTex: THREE.Texture | null = null
function shopfrontTexture(): THREE.Texture {
  if (shopfrontTex) return shopfrontTex
  const W = 128
  const H = 128
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#39454f' // frame + mullion stock: the dark the glass sits in
  ctx.fillRect(0, 0, W, H)
  const riser = H * 0.17 // stall riser at the pavement
  const fascia = H * 0.12 // fascia board the sign hangs off
  const frame = W * 0.06 // frame down each side
  const mull = W * 0.05 // the mullion splitting the two lights
  const gTop = fascia
  const gBot = H - riser
  const lightW = (W - 2 * frame - mull) / 2
  ctx.fillStyle = '#bcd4e0' // glass: brighter and cooler than a home's windows
  ctx.fillRect(frame, gTop, lightW, gBot - gTop)
  ctx.fillRect(W / 2 + mull / 2, gTop, lightW, gBot - gTop)
  ctx.fillStyle = '#6f6252' // stall riser: a solid stone base
  ctx.fillRect(0, gBot, W, riser)
  ctx.fillStyle = '#463c36' // fascia: a painted board for the shop's name
  ctx.fillRect(0, 0, W, fascia)
  ctx.fillStyle = '#33414b' // a transom bar across the lights
  ctx.fillRect(frame, gTop + (gBot - gTop) * 0.24, W - 2 * frame, H * 0.02)
  const tex = new THREE.CanvasTexture(canvas)
  tex.magFilter = THREE.LinearFilter
  tex.anisotropy = 4
  shopfrontTex = tex
  return tex
}

/**
 * Glaze the ground floor of shops and civic buildings with a band of shopfront
 * windows, so a shop reads as a shop from the street rather than as another
 * block of flats. Every pane in the city is one instance of a single glazed bay
 * — one draw call and one material for the lot, like the doors and signs — laid
 * a bay at a time along each wall and stood just proud of the facade.
 *
 * Outward is found by stepping off one perpendicular and asking whether it lands
 * inside the footprint, not by trusting the ring's winding: OSM ways come both
 * ways round, and glazing that faced the stockroom would be worse than none.
 *
 * Returns null for a city with no shops, so no empty mesh joins the group.
 */
function buildShopfronts(buildings: Building[], provider: ElevationProvider): THREE.InstancedMesh | null {
  const up = new THREE.Vector3(0, 1, 0)
  const q = new THREE.Quaternion()
  const pos = new THREE.Vector3()
  const scale = new THREE.Vector3()
  const m = new THREE.Matrix4()
  const panes: THREE.Matrix4[] = []

  for (const b of buildings) {
    if (!SHOPFRONT_KINDS.has(b.kind) || b.footprint.length < 3) continue
    const ring = b.footprint
    const { max } = groundStats(ring, provider)
    // One ground-floor storey tall, fitted to the building like the facade rows,
    // but never so tall a generous ceiling turns the whole front into glass.
    const bandH = Math.min(b.height / storeysIn(b.height), SHOPFRONT_MAX_H, b.height)
    if (bandH <= 0) continue
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]
      const c = ring[(i + 1) % ring.length]
      const dx = c.x - a.x
      const dz = c.z - a.z
      const len = Math.hypot(dx, dz)
      if (len < 1.5) continue // a metre of wall has no window
      let nx = dz / len
      let nz = -dx / len
      const mx = (a.x + c.x) / 2
      const mz = (a.z + c.z) / 2
      if (pointInPolygon(mx + nx * 0.4, mz + nz * 0.4, ring)) {
        nx = -nx
        nz = -nz
      }
      q.setFromAxisAngle(up, Math.atan2(nx, nz)) // the pane fronts the street
      const bays = Math.max(1, Math.round(len / BAY_W))
      const bayW = len / bays
      scale.set(bayW, bandH, 1)
      for (let bay = 0; bay < bays; bay++) {
        const t = (bay + 0.5) / bays
        pos.set(a.x + dx * t + nx * SHOPFRONT_OFFSET, max, a.z + dz * t + nz * SHOPFRONT_OFFSET)
        panes.push(m.compose(pos, q, scale).clone())
      }
    }
  }
  if (!panes.length) return null

  const geo = new THREE.PlaneGeometry(1, 1)
  geo.translate(0, 0.5, 0) // seat the pane on the ground floor, not centred on it
  const mesh = new THREE.InstancedMesh(
    geo,
    // Glass reads from the bright map and a low roughness sheen; no vertex
    // colours, so the pane keeps the texture's own tone rather than the wall's.
    new THREE.MeshStandardMaterial({
      map: shopfrontTexture(),
      metalness: 0.1,
      roughness: 0.25,
      side: THREE.DoubleSide,
    }),
    panes.length,
  )
  mesh.name = 'shopfronts'
  panes.forEach((mat, i) => mesh.setMatrixAt(i, mat))
  mesh.instanceMatrix.needsUpdate = true
  return mesh
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
  snow = 0,
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

    // A facade's windows are drawn UPWARD from its ground floor, so that floor
    // is seated at the HIGHEST ground under the footprint, not the average. On a
    // slope the average sits below the uphill grade, and every window over that
    // grade — the rows the average buried — glowed from inside the dirt. With the
    // floor at the max, the whole window grid clears the ground on every side.
    // The base still reaches down to the lowest corner (+margin), so the downhill
    // side shows a taller plinth rather than floating over the slope.
    const { min, max } = groundStats(b.footprint, provider)
    const skirt = max - min + 0.5
    const geo = new THREE.ExtrudeGeometry(shape, { depth: b.height + skirt, bevelEnabled: false })
    geo.rotateX(Math.PI / 2) // extrude along +Y without mirroring z
    geo.translate(0, max + b.height, 0)

    // Cut a horizontal edge loop at the ground floor (Y = max) so the plinth —
    // the wall below it that reaches down to the lowest corner — is its own band
    // and can be a solid base rather than window rows counted underground.
    splitPlinth(geo, max)

    // Jitter each facade off the palette so neighbours never share a shade, and
    // give the roof a darker, greyer tone so volumes read apart from the road.
    wall.setHex(COLORS[Math.floor(rng() * COLORS.length)])
    wall.offsetHSL((rng() - 0.5) * 0.015, (rng() - 0.5) * 0.05, (rng() - 0.5) * 0.06)
    roof.copy(wall).offsetHSL(0, -0.22, -0.12)
    // In a northern winter the roofs lie snow — only the roof caps, never the walls
    // (a wall sheds it). `snow` 0 (any other season) leaves the roof its own colour.
    paintVolume(geo, wall, snow > 0 ? snowed(roof, snow) : roof)
    // Storeys fitted to this building and counted up from the seated ground
    // floor, so the roof never slices a window row and no row starts underground.
    facadeUVs(geo, max, b.height)

    let batch = batches.get(b.kind)
    if (!batch) {
      batch = newBatch()
      batches.set(b.kind, batch)
    }
    appendTo(batch, geo)
    geo.dispose() // its vertices live in the batch now
    footprints.push(b.footprint)
    tops.push(max + b.height)
  }

  for (const [kind, batch] of batches) group.add(batchMesh(batch, facades.of(kind)))

  // Doors and signs for every building in two instanced draws.
  group.add(buildEntrances(buildings, provider))
  // Shopfront glazing for shops and services, the whole city in one more.
  const shopfronts = buildShopfronts(buildings, provider)
  if (shopfronts) group.add(shopfronts)

  return { mesh: group, footprints, tops, facades }
}

/** Lowest and highest terrain height sampled at a footprint's vertices. */
export function groundStats(ring: Vec2[], provider: ElevationProvider): { min: number; max: number } {
  let min = Infinity
  let max = -Infinity
  for (const p of ring) {
    const h = provider.heightAt(p.x, p.z)
    if (h < min) min = h
    if (h > max) max = h
  }
  return { min, max }
}
