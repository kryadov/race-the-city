import * as THREE from 'three'
import type { Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import { pointInPolygon } from '../physics/collide'

const MAX_TREES = 600
const TREE_AREA = 550 // one scattered tree per ~this many m² of green
const MAX_PER_AREA = 60 // cap scatter per polygon
const RNG_SEED = 0x1a2b3c4d // fixed seed → identical trees on every browser and reload

/** Deterministic PRNG (mulberry32). Using this instead of Math.random keeps the
 * scattered-tree count and layout identical across browsers — Math.random-based
 * rejection sampling otherwise produced a different tree count on each load. */
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
 * Low-poly instanced trees scattered in the green areas (the green ground tint
 * itself is painted onto the ground mesh in buildGround).
 */
/** @param lat the city's latitude — decides whether palms or conifers grow here. */
export function buildGreenery(green: Vec2[][], trees: Vec2[], provider: ElevationProvider, lat: number): THREE.Object3D {
  const group = new THREE.Group()
  const rng = makeRng(RNG_SEED)
  const spots = collectTreeSpots(green, trees, rng)
  if (spots.length) group.add(buildTrees(spots, provider, rng, lat))
  return group
}

/** Explicit tree points plus a capped scatter inside green polygons. */
function collectTreeSpots(green: Vec2[][], trees: Vec2[], rng: () => number): Vec2[] {
  const spots: Vec2[] = trees.slice(0, MAX_TREES)
  for (const ring of green) {
    if (spots.length >= MAX_TREES || ring.length < 3) continue
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity
    for (const p of ring) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.z < minZ) minZ = p.z
      if (p.z > maxZ) maxZ = p.z
    }
    const area = (maxX - minX) * (maxZ - minZ)
    const want = Math.min(MAX_PER_AREA, Math.floor(area / TREE_AREA))
    for (let i = 0; i < want * 2 && spots.length < MAX_TREES; i++) {
      const x = minX + rng() * (maxX - minX)
      const z = minZ + rng() * (maxZ - minZ)
      if (pointInPolygon(x, z, ring)) spots.push({ x, z })
    }
  }
  return spots
}

interface TreeVariant {
  name: string
  foliage: () => THREE.BufferGeometry
  color: number
  folY: number // foliage centre height factor (× scale) above ground
  trunk?: () => THREE.BufferGeometry // defaults to the stubby temperate trunk
}

/** A palm's crown: a wide, flat splay of fronds rather than a conifer's spire. */
function frondGeo(radius: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(radius, 0)
  g.scale(1, 0.34, 1)
  return g
}
const palmTrunk = (h: number) => (): THREE.BufferGeometry => {
  const g = new THREE.CylinderGeometry(0.16, 0.26, h, 5)
  g.translate(0, h / 2 - 1, 0) // the shared trunk is 2 tall and centred at y=1
  return g
}

// Distinct crown shapes for variety; folY = 2 (trunk top) + half the crown height.
const CONIFER: TreeVariant = { name: 'conifer', foliage: () => new THREE.ConeGeometry(1.5, 3.4, 6), color: 0x3f7a3a, folY: 3.7 }
const BROADLEAF: TreeVariant = { name: 'broadleaf', foliage: () => new THREE.IcosahedronGeometry(1.6, 0), color: 0x4f8a3a, folY: 3.6 }
const SPRUCE: TreeVariant = { name: 'spruce', foliage: () => new THREE.ConeGeometry(1.1, 4.8, 6), color: 0x5c8f47, folY: 4.4 }
const PALM_TALL: TreeVariant = { name: 'palm', foliage: () => frondGeo(2.3), color: 0x4e8f42, folY: 5.2, trunk: palmTrunk(6.4) }
const PALM_SHORT: TreeVariant = { name: 'palm', foliage: () => frondGeo(1.9), color: 0x5c9a48, folY: 3.9, trunk: palmTrunk(5.0) }

/**
 * Which trees grow here, by latitude. Conifers in Monaco read as wrong — but so
 * would pure palms, since the Mediterranean has both, so the middle band mixes
 * them and the picker's random bucketing does the rest.
 */
export function variantsFor(lat: number): TreeVariant[] {
  const a = Math.abs(lat)
  if (a <= 38) return [PALM_TALL, PALM_SHORT, BROADLEAF] // subtropics: palms dominate
  if (a <= 48) return [PALM_TALL, BROADLEAF, CONIFER, PALM_SHORT] // Mediterranean: half and half
  return [CONIFER, BROADLEAF, SPRUCE] // north: no palms
}

const UP = new THREE.Vector3(0, 1, 0)

function buildTrees(spots: Vec2[], provider: ElevationProvider, rng: () => number, lat: number): THREE.Object3D {
  const g = new THREE.Group()
  const variants = variantsFor(lat)
  const buckets: Vec2[][] = variants.map(() => [])
  for (const s of spots) buckets[Math.floor(rng() * variants.length)].push(s)

  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.3, 2, 5)
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, flatShading: true })

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const pos = new THREE.Vector3()
  const scl = new THREE.Vector3()
  const col = new THREE.Color()

  variants.forEach((v, vi) => {
    const pts = buckets[vi]
    if (!pts.length) return
    const n = pts.length
    // One instanced draw per variant either way — a palm just brings its own trunk.
    const trunk = new THREE.InstancedMesh(v.trunk ? v.trunk() : trunkGeo, trunkMat, n)
    const foliage = new THREE.InstancedMesh(
      v.foliage(),
      new THREE.MeshStandardMaterial({ color: v.color, flatShading: true }),
      n,
    )
    for (let i = 0; i < n; i++) {
      const s = 0.7 + rng() * 0.7 // size variety
      const y = provider.heightAt(pts[i].x, pts[i].z)
      q.setFromAxisAngle(UP, rng() * Math.PI * 2) // rotation variety
      scl.set(s, s, s)
      pos.set(pts[i].x, y + s, pts[i].z)
      trunk.setMatrixAt(i, m.compose(pos, q, scl))
      pos.set(pts[i].x, y + v.folY * s, pts[i].z)
      foliage.setMatrixAt(i, m.compose(pos, q, scl))
      col.setHex(v.color).offsetHSL((rng() - 0.5) * 0.03, (rng() - 0.5) * 0.12, (rng() - 0.5) * 0.1)
      foliage.setColorAt(i, col) // shade variety
    }
    trunk.instanceMatrix.needsUpdate = true
    foliage.instanceMatrix.needsUpdate = true
    if (foliage.instanceColor) foliage.instanceColor.needsUpdate = true
    g.add(trunk, foliage)
  })
  return g
}
