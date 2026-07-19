import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Road, RoadKind, Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'

/**
 * Traffic lights at the city's major road junctions: a signal head on a pole
 * standing beside the crossroads, its three lamps — red over amber over green —
 * cycling green → amber → red and glowing on the lit one.
 *
 * Ambient only. The background traffic (see traffic.ts) does NOT obey these; they
 * are here for the same reason the trains have headlamps and the platforms have
 * canopy lights — to make a driven-through city read as alive. So they cost a
 * few small groups and a handful of emissive toggles per frame, nothing more.
 *
 * Every material is a flat-shaded `MeshStandardMaterial`, in keeping with the
 * rest of the city; the lit lamp carries its colour in `emissive` and is switched
 * on and off through `emissiveIntensity`, exactly as the train and platform lamps
 * are warmed at dusk.
 */

const UNDRIVABLE = new Set<RoadKind>(['path'])

/** How busy a road is, so a light lands on the arterial crossing not the alley. */
const KIND_RANK: Record<RoadKind, number> = {
  motorway: 6,
  primary: 5,
  secondary: 4,
  residential: 3,
  service: 2,
  path: 0,
  other: 1,
}

/** Vertex-weld grid, matched to roadGraph.ts so crossing ways share a node. */
const CELL = 0.5
/** A junction needs this many segments meeting to be worth signalling — a T or a
 *  crossroads, never a bend (2) or a dead end (1). */
const MIN_DEGREE = 3
/** Two junctions nearer than this are the one busy junction (a welded cluster, a
 *  staggered crossing, a mini-roundabout) — signal it once, not five times. */
const MERGE_DIST = 20
/** Most junctions to signal map-wide — a handful the player meets, busiest first,
 *  the same reasoning that runs the trains where you start rather than everywhere. */
const MAX_LIGHTS = 14
/** How far the pole stands off the junction centre, into a corner, metres. */
const OFFSET = 5

const POLE_H = 3.2 // pole height to the underside of the head, metres
const HEAD_Y = POLE_H + 0.55 // centre height of the signal head
const LAMP_GAP = 0.4 // vertical spacing of the three lenses

// A cycle: green burns longest, amber is a brief warning, red holds the cross.
const GREEN = 6
const AMBER = 1.6
const RED = 5.2
const CYCLE = GREEN + AMBER + RED
/** Phase offset between successive lights, so a street of them never switches as
 *  one. Deterministic per index (index × this, wrapped), and coprime-ish with the
 *  cycle so the offsets spread rather than landing back in step. */
const STAGGER = 3.3
/** Emissive strength of the lit lens — bright enough to read as a glowing signal. */
const LIT = 2.6

/** The dark casing (pole + housing), shaded like the other street ironwork. */
const CASE = 0x1c1e22

/** A lens: nearly black when dark, its own colour when the emissive lights it. */
const RED_LENS = { color: 0x330404, emissive: 0xff2a1a }
const AMBER_LENS = { color: 0x33240a, emissive: 0xffab1f }
const GREEN_LENS = { color: 0x063311, emissive: 0x2bff52 }

export interface TrafficLights {
  update(dt: number): void
  dispose(): void
}

/** A welded road-graph node: where it is, what meets it, and the busiest road on it. */
interface Junction {
  x: number
  z: number
  /** How many segments meet here — its road-graph degree. */
  degree: number
  /** The nodes it links to, as coordinates, for aiming the pole into a corner. */
  neighbours: Vec2[]
  rank: number
}

/**
 * Weld the road polylines into a node graph and hand back the junctions worth
 * signalling. Mirrors roadGraph.ts's grid-weld (crossing OSM ways genuinely share
 * a vertex, and its coordinates survive projection identically, so a grid cell
 * reunites them) but keeps, per node, the highest road rank passing through — so
 * the busiest junctions can be preferred when the cap bites. Tunnels are skipped:
 * they run under the buildings, not across a street-level crossing.
 */
function findJunctions(roads: Road[]): Junction[] {
  const nodes: { x: number; z: number; links: Set<number>; rank: number }[] = []
  const byKey = new Map<string, number>()
  const idOf = (p: Vec2): number => {
    const key = `${Math.round(p.x / CELL)},${Math.round(p.z / CELL)}`
    const hit = byKey.get(key)
    if (hit !== undefined) return hit
    const id = nodes.length
    nodes.push({ x: p.x, z: p.z, links: new Set(), rank: 0 })
    byKey.set(key, id)
    return id
  }

  for (const road of roads) {
    if (UNDRIVABLE.has(road.kind) || road.tunnel) continue
    const rank = KIND_RANK[road.kind] ?? 1
    let prev = -1
    for (const p of road.points) {
      const id = idOf(p)
      if (nodes[id].rank < rank) nodes[id].rank = rank
      if (prev !== -1 && prev !== id) {
        nodes[prev].links.add(id)
        nodes[id].links.add(prev)
      }
      prev = id
    }
  }

  // Resolve each junction's neighbours to coordinates now, while the full node
  // list is still to hand — the returned list is filtered, so an index into it
  // would no longer line up with the graph.
  const junctions: Junction[] = []
  for (const n of nodes) {
    if (n.links.size < MIN_DEGREE) continue
    const neighbours = [...n.links].map((l) => ({ x: nodes[l].x, z: nodes[l].z }))
    junctions.push({ x: n.x, z: n.z, degree: n.links.size, neighbours, rank: n.rank })
  }
  // Busiest first: road rank, then how many ways meet, then a stable coordinate
  // tiebreak so the pick is deterministic given the same roads.
  junctions.sort((a, b) => b.rank - a.rank || b.degree - a.degree || a.x - b.x || a.z - b.z)
  return junctions
}

/**
 * The angle to stand the pole at: opposite the average bearing of the roads
 * leaving the junction, which drops it into a corner rather than out in the
 * carriageway. A symmetric crossroads averages to nothing, so there `rand` picks
 * a corner instead — which is what keeps the layout deterministic given `rand`.
 */
function cornerAngle(j: Junction, rand: () => number): number {
  let dx = 0
  let dz = 0
  for (const nb of j.neighbours) {
    const ux = nb.x - j.x
    const uz = nb.z - j.z
    const len = Math.hypot(ux, uz)
    if (len > 1e-6) {
      dx += ux / len
      dz += uz / len
    }
  }
  return Math.hypot(dx, dz) > 0.2 ? Math.atan2(-dz, -dx) : rand() * Math.PI * 2
}

/** A signal we advance each frame: its three lenses and its place in the cycle. */
interface Signal {
  red: THREE.MeshStandardMaterial
  amber: THREE.MeshStandardMaterial
  green: THREE.MeshStandardMaterial
  offset: number
}

/**
 * Stand traffic lights at the city's major junctions.
 *
 * `rand` is injectable so the layout is stable across reloads when a seeded PRNG
 * is passed (see greenery.ts / streetFurniture.ts for why that matters); it
 * defaults to `Math.random`. `max` caps how many are placed map-wide.
 */
export function createTrafficLights(
  scene: THREE.Scene,
  roads: Road[],
  provider: ElevationProvider,
  rand: () => number = Math.random,
  max = MAX_LIGHTS,
): TrafficLights {
  const group = new THREE.Group()
  scene.add(group)

  // Shared geometry — one casing shape and one lens sphere for every light, so a
  // dozen signals stay a few small buffers. The casing merges the pole and the
  // head box into a single geometry (one draw per light for the dark parts); the
  // lenses are their own meshes because each carries its own switchable material.
  const poleGeo = new THREE.BoxGeometry(0.18, POLE_H, 0.18)
  poleGeo.translate(0, POLE_H / 2, 0)
  const housingGeo = new THREE.BoxGeometry(0.42, 1.3, 0.34)
  housingGeo.translate(0, HEAD_Y, 0)
  const caseGeo = mergeGeometries([poleGeo, housingGeo])
  const lampGeo = new THREE.SphereGeometry(0.13, 10, 8)
  const caseMat = new THREE.MeshStandardMaterial({ color: CASE, flatShading: true, roughness: 0.85 })

  const lens = (spec: { color: number; emissive: number }): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({
      color: spec.color,
      emissive: spec.emissive,
      emissiveIntensity: 0,
      flatShading: true,
    })

  const nodes = findJunctions(roads)

  // Take the busiest first, but never two on top of one another: a real junction
  // welds to a small cluster of nodes, so skip any within MERGE_DIST of one we
  // have already signalled. Stop once the cap is met.
  const chosen: Junction[] = []
  for (const j of nodes) {
    if (chosen.length >= max) break
    if (chosen.some((c) => Math.hypot(c.x - j.x, c.z - j.z) < MERGE_DIST)) continue
    chosen.push(j)
  }

  const signals: Signal[] = []
  chosen.forEach((j, i) => {
    const ang = cornerAngle(j, rand)
    const ox = Math.cos(ang) * OFFSET
    const oz = Math.sin(ang) * OFFSET
    // The head faces back across the road, toward the junction it guards.
    const fx = -Math.cos(ang)
    const fz = -Math.sin(ang)

    const light = new THREE.Group()
    light.position.set(j.x, provider.heightAt(j.x, j.z), j.z)
    light.userData.trafficLight = true

    const casing = new THREE.Mesh(caseGeo, caseMat)
    casing.position.set(ox, 0, oz)
    // Spread across the whole city; three computes an InstancedMesh's — and a
    // mesh's — bounding sphere once, so keep the batch out of the frustum cull.
    casing.frustumCulled = false
    light.add(casing)

    const red = lens(RED_LENS)
    const amber = lens(AMBER_LENS)
    const green = lens(GREEN_LENS)
    const lenses: [THREE.MeshStandardMaterial, number, string][] = [
      [red, LAMP_GAP, 'red'], // red on top
      [amber, 0, 'amber'], // amber in the middle
      [green, -LAMP_GAP, 'green'], // green at the bottom
    ]
    for (const [mat, dy, name] of lenses) {
      const bulb = new THREE.Mesh(lampGeo, mat)
      // On the front face of the head, nudged toward the junction it faces.
      bulb.position.set(ox + fx * 0.2, HEAD_Y + dy, oz + fz * 0.2)
      bulb.userData.trafficLamp = true
      bulb.userData.signal = name
      bulb.frustumCulled = false
      light.add(bulb)
    }

    group.add(light)
    // Deterministic per-index stagger so a run of them never switches together.
    signals.push({ red, amber, green, offset: (i * STAGGER) % CYCLE })
  })

  // Set the lenses for a given moment in the cycle: exactly one lit, the rest dark.
  const apply = (clock: number): void => {
    for (const s of signals) {
      const p = (((clock + s.offset) % CYCLE) + CYCLE) % CYCLE
      s.red.emissiveIntensity = p >= GREEN + AMBER ? LIT : 0
      s.amber.emissiveIntensity = p >= GREEN && p < GREEN + AMBER ? LIT : 0
      s.green.emissiveIntensity = p < GREEN ? LIT : 0
    }
  }

  let clock = 0
  apply(0) // lit from the first frame, before any update lands

  return {
    update(dt) {
      clock += dt
      apply(clock)
    },
    dispose() {
      scene.remove(group)
      group.traverse((o) => {
        const mesh = o as THREE.Mesh
        mesh.geometry?.dispose()
        const mat = mesh.material
        if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((x) => x.dispose())
      })
      signals.length = 0
    },
  }
}
