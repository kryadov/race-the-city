import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Prop, PropKind, Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'

type Part = { geo: THREE.BufferGeometry; mat: THREE.Material }

/** One buildable look for a prop kind: its own parts and its own footprint. */
interface PropVariant {
  /** How much room this specific shape takes on the ground, in metres — an
   * obelisk's plinth is not a column's, so this lives per variant, not per kind. */
  radius: number
  /** How high it stands above the ground, in metres: what a car has to clear to
   * fly over it rather than into it. */
  top: number
  parts: () => Part[]
}

/**
 * Fixed seed → the same statue looks the same shape on every reload and every
 * browser (see RNG_SEED in greenery.ts for why this matters here). Hashed
 * together with the prop's position rather than drawn from a running RNG, so
 * the pick depends only on where a statue is, not on its index in the props
 * array — OSM parsing gives no guarantee that order is stable.
 */
const VARIANT_SEED = 0x5a1e2c7f

/** Deterministic per-prop variant index: a cheap integer hash of the position. */
function pickVariant(at: Vec2, count: number): number {
  if (count <= 1) return 0
  let h = VARIANT_SEED
  h = Math.imul(h ^ Math.floor(at.x * 131), 0x9e3779b1)
  h = Math.imul(h ^ Math.floor(at.z * 131), 0x85ebca6b)
  h ^= h >>> 15
  return Math.abs(h) % count
}

/**
 * Footprints for the collision grid: you should not be able to drive through a
 * fountain. Squares rather than circles, because the grid takes polygons — and
 * at this size nobody can tell.
 */
/** How high each prop stands, in absolute metres, parallel to `propFootprints`. */
export function propTops(props: Prop[], provider: ElevationProvider): number[] {
  return props.map((p) => {
    const variants = VARIANTS[p.kind]
    const v = variants[pickVariant(p.at, variants.length)]
    return provider.heightAt(p.at.x, p.at.z) + v.top
  })
}

export function propFootprints(props: Prop[]): Vec2[][] {
  return props.map((p) => {
    const variants = VARIANTS[p.kind]
    const r = variants[pickVariant(p.at, variants.length)].radius
    return [
      { x: p.at.x - r, z: p.at.z - r },
      { x: p.at.x + r, z: p.at.z - r },
      { x: p.at.x + r, z: p.at.z + r },
      { x: p.at.x - r, z: p.at.z + r },
    ]
  })
}

/**
 * Every buildable look for every prop kind. Fountains and flowerbeds get one
 * look each; statues get four, so a plaza full of them doesn't read as the
 * same plinth copy-pasted down the street.
 */
const VARIANTS: Record<PropKind, PropVariant[]> = {
  // A city fountain, at the size one actually is: a wide basin you could sit
  // on, two tiers, a central jet, and arcs of water thrown in from the rim.
  // The arcs are the whole point — they are what says "fountain" from across
  // the square, and without them this is a plinth with a stick on it.
  fountain: [
    {
      radius: 3.3,
      top: 3.9,
      parts: () => [
        { geo: ring(3.2, 0.55), mat: stone(0xa9a294) }, // basin wall
        { geo: disc(3.35, 0.14, 0.55), mat: stone(0xb9b2a4) }, // coping, wide enough to sit on
        { geo: disc(3.1, 0.16, 0.45), mat: water() }, // the pool
        { geo: cyl(0.3, 0.5, 1.4, 0.5), mat: stone(0xb5aea0) }, // stem
        { geo: bowl(1.5, 0.4, 1.85), mat: stone(0xb9b2a4) }, // lower tier
        { geo: disc(1.35, 0.1, 2.06), mat: water() },
        { geo: cyl(0.18, 0.24, 0.95, 2.15), mat: stone(0xb5aea0) }, // upper stem
        { geo: bowl(0.8, 0.28, 2.95), mat: stone(0xb9b2a4) }, // upper tier
        { geo: disc(0.7, 0.08, 3.1), mat: water() },
        { geo: cyl(0.12, 0.07, 1.4, 3.2), mat: jet() }, // the central jet
        { geo: spray(0.75, 1.2, 3.3), mat: jet() }, // falling off the top tier
        ...rimArcs(6, 2.55, 1.5, 0.9).map((geo) => ({ geo, mat: jet() })),
      ],
    },
  ],
  statue: [
    // 1. The original: a standing figure on a plinth. Thin and vertical.
    {
      radius: 0.75,
      top: 2.7,
      parts: () => [
        { geo: boxGeo(1.2, 0.9, 1.2, 0.45), mat: stone(0x8d8778) },
        { geo: boxGeo(0.42, 1.5, 0.34, 1.65), mat: stone(0x9a9484) },
        { geo: sphere(0.19, 2.5), mat: stone(0x9a9484) },
      ],
    },
    // 2. Equestrian: a horse and rider on a wide plinth. A horizontal bulk —
    // the opposite silhouette of the standing figure, which is the point.
    {
      radius: 1.3,
      top: 3.15,
      parts: () => [
        { geo: boxGeo(1.7, 1.0, 1.0, 0.5), mat: stone(0x8d8778) }, // plinth
        { geo: legs(1.0), mat: bronze(0x6b5a42) }, // planted on the plinth top
        { geo: boxGeo(1.1, 0.5, 0.45, 2.0), mat: bronze(0x6b5a42) }, // torso
        { geo: neck(), mat: bronze(0x6b5a42) }, // raised head and neck
        { geo: boxGeo(0.24, 0.62, 0.2, 2.56), mat: bronze(0x74644a) }, // rider
        { geo: sphere(0.13, 3.0), mat: bronze(0x74644a) }, // rider's head
      ],
    },
    // 3. A bust on a tall column. Thin and tall, taller than the standing
    // figure — the skyline silhouette, not a street-level one.
    {
      radius: 0.5,
      top: 3.35,
      parts: () => [
        { geo: boxGeo(0.6, 0.3, 0.6, 0.15), mat: stone(0x8d8778) }, // base
        { geo: pillar(0.16, 0.2, 2.0, 0.3), mat: stone(0x9a9484) }, // column
        { geo: disc(0.26, 0.14, 2.37), mat: stone(0x8d8778) }, // capital
        { geo: cyl(0.12, 0.24, 0.5, 2.44), mat: bronze(0x74644a) }, // shoulders
        { geo: sphere(0.2, 3.14), mat: bronze(0x74644a) }, // the bust's head
      ],
    },
    // 4. An obelisk: no figure at all, just a tapering square shaft. The
    // simplest of the four, and the one that reads as a monument from furthest.
    {
      radius: 0.65,
      top: 3.55,
      parts: () => [
        { geo: boxGeo(1.0, 0.4, 1.0, 0.2), mat: stone(0x8d8778) },
        { geo: pillar(0.12, 0.32, 3.0, 0.4), mat: stone(0x9a9484) },
        { geo: pyramidion(0.14, 0.4, 3.4), mat: stone(0x9a9484) },
      ],
    },
  ],
  // A low kerb of soil with a bloom of colour on top.
  flowerbed: [
    {
      radius: 1.7,
      top: 0.55,
      parts: () => [
        { geo: ring(1.6, 0.22), mat: stone(0x9c9384) },
        { geo: disc(1.45, 0.14, 0.2), mat: soil() },
        { geo: disc(1.35, 0.22, 0.3), mat: bloom() },
      ],
    },
  ],
}

/**
 * Street ornaments from OSM: fountains, statues and flowerbeds.
 *
 * One instanced draw per part per variant for the whole city, so a park full
 * of them — or a city full of four kinds of statue — costs the same as a
 * handful of draw calls, not one mesh per ornament.
 */
export function buildProps(props: Prop[], provider: ElevationProvider): THREE.Object3D {
  const group = new THREE.Group()
  if (!props.length) return group

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const pos = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)

  for (const kind of Object.keys(VARIANTS) as PropKind[]) {
    const here = props.filter((p) => p.kind === kind)
    if (!here.length) continue
    const variants = VARIANTS[kind]

    // Bucket by variant first — same trick as buildTrees in greenery.ts — so
    // each shape still gets exactly one instanced draw per part, no matter how
    // many statues in the city ended up looking like it.
    const buckets: Prop[][] = variants.map(() => [])
    for (const p of here) buckets[pickVariant(p.at, variants.length)].push(p)

    variants.forEach((variant, vi) => {
      const bucket = buckets[vi]
      if (!bucket.length) return
      for (const part of variant.parts()) {
        const mesh = new THREE.InstancedMesh(part.geo, part.mat, bucket.length)
        bucket.forEach((p, i) => {
          pos.set(p.at.x, provider.heightAt(p.at.x, p.at.z), p.at.z)
          mesh.setMatrixAt(i, m.compose(pos, q, one))
        })
        mesh.instanceMatrix.needsUpdate = true
        group.add(mesh)
      }
    })
  }
  return group
}

const stone = (color: number): THREE.Material =>
  new THREE.MeshStandardMaterial({ color, flatShading: true })
/** The cast-metal figure on a stone plinth — a duller sheen than bare stone. */
const bronze = (color: number): THREE.Material =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, metalness: 0.35, roughness: 0.55 })
const water = (): THREE.Material =>
  new THREE.MeshStandardMaterial({
    color: 0x4f9ad0,
    transparent: true,
    opacity: 0.85,
    flatShading: true,
    // A little glow, so the water reads as water from across the square rather
    // than as a blue-grey disc.
    emissive: new THREE.Color(0x1d5f92),
    emissiveIntensity: 0.35,
  })
/** Moving water: brighter and more translucent than the pool it falls into. */
const jet = (): THREE.Material =>
  new THREE.MeshStandardMaterial({
    color: 0xd6ecff,
    transparent: true,
    opacity: 0.5,
    flatShading: true,
    emissive: new THREE.Color(0x9fd0f0),
    emissiveIntensity: 0.5,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
const soil = (): THREE.Material => new THREE.MeshStandardMaterial({ color: 0x4a3728, flatShading: true })
const bloom = (): THREE.Material => new THREE.MeshStandardMaterial({ color: 0xc8477e, flatShading: true })

const boxGeo = (w: number, h: number, d: number, y: number): THREE.BufferGeometry => {
  const g = new THREE.BoxGeometry(w, h, d)
  g.translate(0, y, 0)
  return g
}
const cyl = (rTop: number, rBot: number, h: number, y: number): THREE.BufferGeometry => {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, 8)
  g.translate(0, y + h / 2, 0)
  return g
}
const disc = (r: number, h: number, y: number): THREE.BufferGeometry => {
  const g = new THREE.CylinderGeometry(r, r, h, 12)
  g.translate(0, y, 0)
  return g
}
const sphere = (r: number, y: number): THREE.BufferGeometry => {
  const g = new THREE.SphereGeometry(r, 8, 6)
  g.translate(0, y, 0)
  return g
}
/**
 * Arcs of water thrown from the rim toward the middle.
 *
 * One geometry per arc, each with its rotation baked in, so every fountain in
 * the city still costs one instanced draw per arc — a handful for the lot,
 * rather than a mesh per fountain.
 *
 * @param n how many arcs around the rim
 * @param r how far out they start
 * @param rise how high they go
 * @param reach how far in they land
 */
const rimArcs = (n: number, r: number, rise: number, reach: number): THREE.BufferGeometry[] => {
  const out: THREE.BufferGeometry[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    // A half-torus standing on its edge reads as a jet arcing over and down.
    const g = new THREE.TorusGeometry((r - reach) / 2 + 0.35, 0.055, 4, 10, Math.PI)
    g.scale(1, rise / ((r - reach) / 2 + 0.35), 1)
    g.rotateY(Math.PI / 2) // stand the ring up
    g.translate((r + reach) / 2, 0.75, 0) // out on the rim, above the water
    g.rotateY(-a) // and around to its place
    out.push(g)
  }
  return out
}

/** A shallow open bowl, mouth up — the fountain's upper tier. */
const bowl = (r: number, h: number, y: number): THREE.BufferGeometry => {
  const g = new THREE.CylinderGeometry(r, r * 0.35, h, 12, 1, true)
  g.translate(0, y + h / 2, 0)
  return g
}

/** A cone of falling water, mouth down, around the jet. */
const spray = (r: number, h: number, y: number): THREE.BufferGeometry => {
  const g = new THREE.ConeGeometry(r, h, 12, 1, true)
  g.rotateX(Math.PI) // apex up: water spreading as it falls
  g.translate(0, y + h / 2, 0)
  return g
}

/** An open rim: the wall of a basin or a flowerbed's kerb. */
const ring = (r: number, h: number): THREE.BufferGeometry => {
  const g = new THREE.CylinderGeometry(r, r, h, 14, 1, true)
  g.translate(0, h / 2, 0)
  return g
}

/**
 * A tapering square pillar: a 4-sided cylinder turned 45° so a flat face
 * points forward instead of an edge. The obelisk's shaft and the bust
 * column both stand on this.
 */
const pillar = (rTop: number, rBot: number, h: number, y: number): THREE.BufferGeometry => {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, 4)
  g.rotateY(Math.PI / 4)
  g.translate(0, y + h / 2, 0)
  return g
}

/** A square-based pyramid: the obelisk's capstone. */
const pyramidion = (r: number, h: number, y: number): THREE.BufferGeometry => {
  const g = new THREE.ConeGeometry(r, h, 4)
  g.rotateY(Math.PI / 4)
  g.translate(0, y + h / 2, 0)
  return g
}

/**
 * Four legs planted under the horse's body, merged into one geometry so the
 * whole cluster is still a single instanced part — a horse costs one draw
 * call for its legs, not four.
 */
const legs = (y: number): THREE.BufferGeometry => {
  const offsets: [number, number][] = [
    [0.55, 0.18], [0.55, -0.18], [-0.5, 0.18], [-0.5, -0.18],
  ]
  const boxes = offsets.map(([x, z]) => {
    const g = new THREE.BoxGeometry(0.14, 0.75, 0.14)
    g.translate(x, y + 0.375, z)
    return g
  })
  return mergeGeometries(boxes)
}

/** The horse's neck and head, raised off the front of the torso. */
const neck = (): THREE.BufferGeometry => {
  const g = new THREE.BoxGeometry(0.22, 0.6, 0.22)
  g.rotateZ(-0.6) // leans forward and up, off the shoulders
  g.translate(0.45, 2.15, 0)
  return g
}
