import * as THREE from 'three'
import type { Surface, Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import type { VehicleType } from '../vehicle/vehicles'
import { pointInPolygon } from '../physics/collide'

// Standing crop over the farmland, mown to stubble where the combine drives, with
// the odd hay bale left behind in the cut strip. Everything is bounded: a capped,
// point-in-polygon-clipped scatter of instanced stalks over a coarse mown grid, and
// a per-frame update that costs NOTHING unless the player is actually in the combine
// (it early-returns for every other vehicle). The layer is static world — no mover
// tag; its neon look is handled through theme.ts's WorldRefs/collectNeonMats, not the
// live mover scan (see main.ts wiring). Recreated per city like the movers, so the
// mown state resets with the field.

/** The mown-grid cell size, in metres. A swathe reads as a few cells wide. */
export const CELL_M = 5
/** How wide a swathe the combine's header cuts, in metres (the mow disc radius). */
export const MOW_RADIUS = 4.5
/** One candidate stalk every ~this many metres before clipping to the field. */
const CROP_GRID_M = 2.2
/** Global crop-instance budget — subsampled down to this however big the farmland. */
export const CROP_CAP = 4000
/** Bound the point-in-polygon scan for a giant tract, before subsampling. */
const CROP_CANDIDATE_CAP = 30000
/** Fixed seed → the same crop on every browser and reload. */
const CROP_SEED = 0xc0ffee01
/** Its own seed for bale drops → deterministic bales given the same drive. */
const BALE_SEED = 0xba1e5eed
/** At most this many hay bales across the whole map. */
export const BALE_CAP = 120
/** Chance a freshly mown crop cell drops a bale. */
const BALE_CHANCE = 0.16
/** A mown stalk shrinks to this fraction of its height — short stubble, not gone. */
const STUBBLE_FRAC = 0.16
/** Standing stalk height, in metres. */
const CROP_H = 1.15
/** Bale radius (a round bale on its side), in metres. */
const BALE_R = 0.7
const WHEAT = 0xcaa63e // warm standing-crop gold
const STRAW = 0xd8b968 // a shade lighter for the baled straw

const UP = new THREE.Vector3(0, 1, 0)

export interface Crops {
  /** The group holding the crop + bale instanced meshes (for the neon WorldRefs). */
  object: THREE.Object3D
  /** Mow the strip under the combine. A no-op for every other vehicle type. */
  update(dt: number, carX: number, carZ: number, vehicleType: VehicleType): void
  setEnabled(on: boolean): void
  dispose(): void
  /** Total crop stalks scattered. */
  cropCount(): number
  /** Crop stalks still standing (not yet mown). */
  standingCount(): number
  /** How many grid cells have been mown. */
  mownCellCount(): number
  /** How many hay bales have been dropped. */
  baleCount(): number
  /** Base (x, z) of every crop stalk — for the clip test. */
  cropSpots(): Vec2[]
  /** Whether the cell containing (x, z) has been mown. */
  isCellMown(x: number, z: number): boolean
}

/** Deterministic PRNG (mulberry32), matching greenery/boats so layout is stable. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The grid cell (x, z) falls in, as a stable string key. */
export function cellKey(x: number, z: number, size = CELL_M): string {
  return `${Math.floor(x / size)}:${Math.floor(z / size)}`
}

/**
 * Every grid cell whose rectangle the mow disc (centre `x,z`, `radius`) touches —
 * the cells the combine cuts this frame. Tested by the disc-vs-rectangle nearest
 * point, so a cell only counts if the swathe actually reaches into it.
 */
export function cellsInDisc(x: number, z: number, radius: number, size = CELL_M): string[] {
  const out: string[] = []
  const cx0 = Math.floor((x - radius) / size)
  const cx1 = Math.floor((x + radius) / size)
  const cz0 = Math.floor((z - radius) / size)
  const cz1 = Math.floor((z + radius) / size)
  const r2 = radius * radius
  for (let cx = cx0; cx <= cx1; cx++) {
    for (let cz = cz0; cz <= cz1; cz++) {
      const nx = Math.max(cx * size, Math.min(x, (cx + 1) * size))
      const nz = Math.max(cz * size, Math.min(z, (cz + 1) * size))
      const dx = x - nx
      const dz = z - nz
      if (dx * dx + dz * dz <= r2) out.push(`${cx}:${cz}`)
    }
  }
  return out
}

/** Keep at most `max`, evenly strided — the greenery/props thinning idiom. */
function subsample(items: Vec2[], max: number): Vec2[] {
  if (items.length <= max) return items
  const stride = items.length / max
  const out: Vec2[] = []
  for (let i = 0; out.length < max && Math.floor(i) < items.length; i += stride) out.push(items[Math.floor(i)])
  return out
}

/**
 * A dense, deterministic scatter of crop stalks clipped to the farmland polygons —
 * a jittered grid so rows don't line up, point-in-polygon so none stray off the
 * field, bounded twice over (the scan stops at CROP_CANDIDATE_CAP, the result is
 * strided down to CROP_CAP) so even a square-kilometre farm costs a few thousand
 * instanced stalks. Exported for the clip/cap tests.
 */
export function collectCropSpots(farmland: Vec2[][], rng: () => number): Vec2[] {
  const spots: Vec2[] = []
  for (const ring of farmland) {
    if (ring.length < 3 || spots.length >= CROP_CANDIDATE_CAP) continue
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity
    for (const p of ring) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.z < minZ) minZ = p.z
      if (p.z > maxZ) maxZ = p.z
    }
    for (let z = minZ; z < maxZ && spots.length < CROP_CANDIDATE_CAP; z += CROP_GRID_M) {
      for (let x = minX; x < maxX && spots.length < CROP_CANDIDATE_CAP; x += CROP_GRID_M) {
        const jx = x + (rng() - 0.5) * CROP_GRID_M
        const jz = z + (rng() - 0.5) * CROP_GRID_M
        if (pointInPolygon(jx, jz, ring)) spots.push({ x: jx, z: jz })
      }
    }
  }
  return subsample(spots, CROP_CAP)
}

/**
 * Standing crop over the farmland fields, which the combine mows as it drives.
 *
 * The crop is one InstancedMesh of upright stalks, scattered and clipped to the
 * `farmland` surfaces and mapped onto a coarse grid of cells. Driving the combine
 * over a cell shrinks its stalks to stubble (idempotently — a mown cell is tracked
 * and skipped) and now and then leaves a hay bale, capped at BALE_CAP. Any other
 * vehicle costs nothing: `update` returns immediately unless you're in the combine.
 */
export function createCrops(
  scene: THREE.Scene,
  surfaces: Surface[],
  provider: ElevationProvider,
): Crops {
  const group = new THREE.Group()
  scene.add(group)

  const farmland = surfaces.filter((s) => s.kind === 'farmland').map((s) => s.ring)
  const rng = makeRng(CROP_SEED)
  const spots = collectCropSpots(farmland, rng)
  const n = spots.length

  // Per-instance base pose, kept so a mown stalk can be recomposed to stubble in
  // place (same spot and spin, a fraction of the height) rather than hidden outright.
  const baseS = new Float32Array(n)
  const baseRy = new Float32Array(n)
  const baseGy = new Float32Array(n)
  const cellInstances = new Map<string, number[]>()
  const mown = new Set<string>()
  let standing = n
  let baleCount = 0

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const pos = new THREE.Vector3()
  const scl = new THREE.Vector3()
  const col = new THREE.Color()

  let cropMesh: THREE.InstancedMesh | null = null
  let baleMesh: THREE.InstancedMesh | null = null

  if (n > 0) {
    // A thin four-sided cone, base on the ground (translated up half its height),
    // so scaling Y alone shortens it to stubble without lifting it off the soil.
    const cropGeo = new THREE.ConeGeometry(0.18, CROP_H, 4)
    cropGeo.translate(0, CROP_H / 2, 0)
    cropMesh = new THREE.InstancedMesh(cropGeo, new THREE.MeshStandardMaterial({ color: WHEAT, flatShading: true }), n)
    for (let i = 0; i < n; i++) {
      const s = 0.8 + rng() * 0.5
      const ry = rng() * Math.PI * 2
      const gy = provider.heightAt(spots[i].x, spots[i].z)
      baseS[i] = s
      baseRy[i] = ry
      baseGy[i] = gy
      q.setFromAxisAngle(UP, ry)
      scl.set(s, s, s)
      pos.set(spots[i].x, gy, spots[i].z)
      cropMesh.setMatrixAt(i, m.compose(pos, q, scl))
      col.setHex(WHEAT).offsetHSL((rng() - 0.5) * 0.03, (rng() - 0.5) * 0.1, (rng() - 0.5) * 0.12)
      cropMesh.setColorAt(i, col) // shade variety; setColorAt only (no vertexColors → no black)
      const key = cellKey(spots[i].x, spots[i].z)
      const list = cellInstances.get(key)
      if (list) list.push(i)
      else cellInstances.set(key, [i])
    }
    cropMesh.instanceMatrix.needsUpdate = true
    if (cropMesh.instanceColor) cropMesh.instanceColor.needsUpdate = true
    group.add(cropMesh)

    // A pool of round bales, all hidden (zero-scale) until mowing reveals them. They
    // are placed far from the origin as the drive goes on, so the once-computed
    // bounding sphere is wrong — hence frustumCulled = false (cheap: ≤ BALE_CAP).
    const baleGeo = new THREE.CylinderGeometry(BALE_R, BALE_R, 1.5, 10)
    baleGeo.rotateZ(Math.PI / 2) // lay it on its side, axis along x
    baleMesh = new THREE.InstancedMesh(baleGeo, new THREE.MeshStandardMaterial({ color: STRAW, flatShading: true }), BALE_CAP)
    baleMesh.frustumCulled = false
    scl.set(0, 0, 0)
    for (let i = 0; i < BALE_CAP; i++) baleMesh.setMatrixAt(i, m.compose(pos.set(0, 0, 0), q.identity(), scl))
    baleMesh.instanceMatrix.needsUpdate = true
    group.add(baleMesh)
  }

  const baleRng = makeRng(BALE_SEED)
  const dropBale = (x: number, z: number): void => {
    if (!baleMesh || baleCount >= BALE_CAP) return
    q.setFromAxisAngle(UP, baleRng() * Math.PI * 2)
    scl.set(1, 1, 1)
    pos.set(x, provider.heightAt(x, z) + BALE_R, z)
    baleMesh.setMatrixAt(baleCount, m.compose(pos, q, scl))
    baleCount++
  }

  const mowCell = (key: string, idxs: number[]): void => {
    mown.add(key)
    for (const i of idxs) {
      q.setFromAxisAngle(UP, baseRy[i])
      scl.set(baseS[i], baseS[i] * STUBBLE_FRAC, baseS[i])
      pos.set(spots[i].x, baseGy[i], spots[i].z)
      cropMesh!.setMatrixAt(i, m.compose(pos, q, scl))
      standing--
    }
    // Occasionally leave a bale behind, at the first stalk's spot in the cell.
    if (baleRng() < BALE_CHANCE) dropBale(spots[idxs[0]].x, spots[idxs[0]].z)
  }

  return {
    object: group,
    update(_dt, carX, carZ, vehicleType) {
      // The whole point: no cost at all unless you're actually harvesting.
      if (vehicleType !== 'combine' || !cropMesh) return
      let changed = false
      for (const key of cellsInDisc(carX, carZ, MOW_RADIUS)) {
        if (mown.has(key)) continue // idempotent: a cut cell stays cut
        const idxs = cellInstances.get(key)
        if (!idxs) continue // no crop in this cell — nothing to mow
        mowCell(key, idxs)
        changed = true
      }
      if (changed) {
        cropMesh.instanceMatrix.needsUpdate = true
        if (baleMesh) baleMesh.instanceMatrix.needsUpdate = true
      }
    },
    setEnabled(on) {
      group.visible = on
    },
    dispose() {
      scene.remove(group)
      group.traverse((o) => {
        const mesh = o as THREE.Mesh
        mesh.geometry?.dispose()
        const mm = mesh.material
        if (mm) (Array.isArray(mm) ? mm : [mm]).forEach((x) => x.dispose())
      })
      cellInstances.clear()
      mown.clear()
    },
    cropCount: () => n,
    standingCount: () => standing,
    mownCellCount: () => mown.size,
    baleCount: () => baleCount,
    cropSpots: () => spots.slice(),
    isCellMown: (x, z) => mown.has(cellKey(x, z)),
  }
}
