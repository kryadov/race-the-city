import * as THREE from 'three'
import type { Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import { roomAt } from '../world/area'
import { waterLevel } from '../world/water'
import { pointInPolygon } from '../physics/collide'

/** A ship needs this much clear water around it, in metres. */
const SHIP_ROOM = 55
/**
 * A motor yacht is a third the cargo ship's length and turns inside its own
 * hull rather than needing a wide bend to come about in — most of what it
 * wants is turning room, not a harbour's worth of open water.
 */
const YACHT_ROOM = 38
/**
 * A sailing boat wants more than a rowboat's puddle — the boom swings out
 * past the hull — but nothing like a yacht's turning circle, since it pivots
 * about its own length rather than motoring wide.
 */
const SAIL_ROOM = 24
/** A rowing boat is happy on anything from a pond up. */
const ROWBOAT_ROOM = 14
/**
 * The least clear-water radius, in metres, that still floats a (rowing) boat.
 * The whole-map sampling grid steps every 40m and only keeps ROWBOAT_ROOM-sized
 * water, so a pond a couple of boat-lengths across falls between its teeth and
 * comes back empty — no boat ("в маленьких озёрах не вижу лодочников"). This
 * smaller floor is used by the fine per-pond rescue sweep in `spots()`.
 */
const MIN_ROOM = 6
/** Half the length of each hull — what has to stay wet, not just its centre. */
const SHIP_HALF = 19
const YACHT_HALF = 8
const SAIL_HALF = 4.5
const ROWBOAT_HALF = 2.4
/**
 * The biggest circle a boat will patrol, in metres.
 *
 * Without a cap this is half the clear water it found, which on the Nile came
 * out at 161m — a 320m circuit in a river a few hundred metres wide, most of
 * it over the bank. A boat going round something you can see the whole of reads
 * as a boat; a boat on a circuit bigger than the view reads as a boat driving
 * into the scenery.
 */
const MAX_CIRCLE = 60
/**
 * Clear water two patrol circles must keep between them, in metres.
 *
 * `spots()` ranks candidates by room and hands back up to CANDIDATES of them,
 * which on a wide harbour are often the same bend measured forty metres apart
 * on the sampling grid. Without a gap every one of those qualifies and a
 * harbour fills up with boats stacked on the same stretch of water.
 */
const BOAT_GAP = 25
const SHIP_SPEED = 4.5
const YACHT_SPEED = 6.5 // the fastest thing on the water — it's under power and built for it
const SAIL_SPEED = 2.2 // ambling: a sailing boat is not in a hurry
const ROW_SPEED = 1.2

export interface Boats {
  update(dt: number): void
  setEnabled(on: boolean): void
  dispose(): void
}

interface Afloat {
  mesh: THREE.Group
  cx: number
  cz: number
  radius: number
  angle: number
  speed: number
  turn: number
}

function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const mat = (c: number): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color: c, flatShading: true })

/**
 * Is a boat of half-length `half`, going round a circle of `radius` about
 * (cx, cz), in the water the whole way round?
 *
 * Checked at the hull's ends rather than its centre, which is the difference
 * between a ship afloat and a ship in a car park.
 */
export function circleFits(
  ring: Vec2[],
  cx: number,
  cz: number,
  radius: number,
  half: number,
): boolean {
  const STEPS = 16
  for (let i = 0; i < STEPS; i++) {
    const a = (i / STEPS) * Math.PI * 2
    const x = cx + Math.cos(a) * radius
    const z = cz + Math.sin(a) * radius
    // The hull lies along the circle, so its ends are a tangent step either way.
    const tx = -Math.sin(a) * half
    const tz = Math.cos(a) * half
    if (!pointInPolygon(x + tx, z + tz, ring)) return false
    if (!pointInPolygon(x - tx, z - tz, ring)) return false
  }
  return true
}

/**
 * How far out to look for water, and how finely — metres.
 *
 * The whole map, and not a metre less: this is RADIUS in `main.ts`, the ground
 * mesh's half-size, and you can drive to any of it. It was 900m on a fog
 * argument, which was simply wrong — the fog hides what is far from the CAMERA,
 * not from the city centre, and the map's corners are 1414m out. Two lakes near
 * the edge of it therefore got nothing.
 */
const LOOK = 1000
const LOOK_STEP = 40
/**
 * How many of the roomiest spots to try before giving this water up.
 *
 * Also what makes a big harbour hold more than one boat: candidates are
 * ranked nearest-the-middle within their tier, so on a wide open body the
 * first several dozen are all clustered within one ship's 145m separation
 * gap (2 x MAX_CIRCLE + BOAT_GAP) of each other and get rejected. Cut short
 * at 40, a harbour the size of a small sea reads exactly like a pond — one
 * boat, because nothing further out was ever offered. 300 reaches far enough
 * past that cluster for a genuinely big body of water to actually place more
 * than one.
 */
const CANDIDATES = 300

/** What a vessel needs, and how it moves once it has it. */
interface Kind {
  name: 'rowboat' | 'sail' | 'yacht' | 'ship'
  room: number // minimum clear water to qualify, in metres
  half: number // half-length: what has to stay wet round the whole patrol circle
  speed: number
  /**
   * Chance a qualifying spot actually gets one, once the map already has a
   * boat afloat somewhere. Bigger vessels need rarer water to qualify at all,
   * so once one is found it is shown more often — a ship-sized gap in a city
   * is not a thing to then also roll dice on.
   */
  showChance: number
  build: () => THREE.Group
}

/**
 * Every vessel, ascending by room needed. `kindFor` walks this to find the
 * biggest one a given spot qualifies for, the same order `spots()` ranks
 * candidates in — biggest-capable first.
 */
const KINDS: Kind[] = [
  { name: 'rowboat', room: ROWBOAT_ROOM, half: ROWBOAT_HALF, speed: ROW_SPEED, showChance: 0.4, build: rowboat },
  { name: 'sail', room: SAIL_ROOM, half: SAIL_HALF, speed: SAIL_SPEED, showChance: 0.5, build: sailboat },
  { name: 'yacht', room: YACHT_ROOM, half: YACHT_HALF, speed: YACHT_SPEED, showChance: 0.65, build: yacht },
  { name: 'ship', room: SHIP_ROOM, half: SHIP_HALF, speed: SHIP_SPEED, showChance: 0.75, build: ship },
]

/** Index into KINDS of the biggest vessel that fits in this much room. */
function tierOf(room: number): number {
  let tier = 0
  for (let i = 0; i < KINDS.length; i++) if (room >= KINDS[i].room) tier = i
  return tier
}

/** The biggest vessel a spot with this much clear water around it qualifies for. */
function kindFor(room: number): Kind {
  return KINDS[tierOf(room)]
}

/**
 * Every spot on the map with room for a boat in this water, widest first.
 *
 * Room alone is not enough and never was. The outline says where water would
 * be; only the ground says whether it is. The Nile's outline is 73 square
 * kilometres of which a good deal is dry: its islands are inner rings, and we
 * do not read inner rings, so Gezira is "water" as far as the polygon knows.
 * Hence the widest point of it — measured — sits 340m from any edge with a
 * quarter of the circle round it standing above the river.
 *
 * So the caller walks these in order and takes the first whose whole circuit is
 * actually wet, rather than taking the widest and being told afterwards that it
 * is a park.
 *
 * @param level the height the water sits at, from `waterLevel`
 */
export function spots(
  ring: Vec2[],
  provider: ElevationProvider,
  level: number,
): { x: number; z: number; r: number }[] {
  const found: { x: number; z: number; r: number }[] = []
  // The whole map, and not a metre less: this is RADIUS in `main.ts`, the ground
  // mesh's half-size, and you can drive to any of it. It was a 900m circle round
  // the middle on a fog argument, which was simply wrong — the fog hides what is
  // far from the CAMERA, and the map's corners are 1414m out.
  for (let x = -LOOK; x <= LOOK; x += LOOK_STEP) {
    for (let z = -LOOK; z <= LOOK; z += LOOK_STEP) {
      const r = roomAt(ring, x, z)
      if (r < ROWBOAT_ROOM) continue
      if (provider.heightAt(x, z) > level) continue // dry land inside the outline
      found.push({ x, z, r })
    }
  }
  // Small ponds fall between the 40m grid's teeth: no sample lands inside one a
  // couple of boat-lengths across, so it comes back empty and never floats a
  // boat. If the coarse sweep found nothing for this body, sweep just its own
  // bounding box at a fine step, down to the smaller MIN_ROOM floor — a rowboat
  // is content on a pond, and kindFor picks it for water this size.
  if (found.length === 0) {
    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    for (const p of ring) {
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
      minZ = Math.min(minZ, p.z)
      maxZ = Math.max(maxZ, p.z)
    }
    // Clamp to the map, exactly as the coarse sweep is bounded to ±LOOK — water
    // that runs off the edge is not ours to put a boat on (a lake wholly off the
    // map collapses to an empty box and yields nothing, as it must).
    minX = Math.max(-LOOK, Math.min(LOOK, minX))
    maxX = Math.max(-LOOK, Math.min(LOOK, maxX))
    minZ = Math.max(-LOOK, Math.min(LOOK, minZ))
    maxZ = Math.max(-LOOK, Math.min(LOOK, maxZ))
    const step = Math.max(3, Math.min(maxX - minX, maxZ - minZ) / 8)
    for (let x = minX; x <= maxX; x += step) {
      for (let z = minZ; z <= maxZ; z += step) {
        const r = roomAt(ring, x, z)
        if (r < MIN_ROOM) continue
        if (provider.heightAt(x, z) > level) continue
        found.push({ x, z, r })
      }
    }
  }
  // Roomy enough for the biggest vessel first, and among those the nearest to
  // the middle — not simply the roomiest, which on a river is always its
  // widest bend out at the map's corner, where a ship is technically afloat
  // and practically absent.
  const rank = (p: { x: number; z: number; r: number }): number =>
    (KINDS.length - 1 - tierOf(p.r)) * 1e6 + Math.hypot(p.x, p.z)
  found.sort((a, b) => rank(a) - rank(b))
  return found.slice(0, CANDIDATES)
}

/** Is the whole circle a boat would go round under water, not over a bank in it? */
function circleIsWet(
  cx: number,
  cz: number,
  radius: number,
  provider: ElevationProvider,
  level: number,
): boolean {
  const STEPS = 12
  for (let i = 0; i < STEPS; i++) {
    const a = (i / STEPS) * Math.PI * 2
    if (provider.heightAt(cx + Math.cos(a) * radius, cz + Math.sin(a) * radius) > level) return false
  }
  return true
}

/** A small cargo ship, pointing +x. */
function ship(): THREE.Group {
  const g = new THREE.Group()
  const hull = new THREE.Mesh(new THREE.BoxGeometry(34, 3.2, 8), mat(0x30506b))
  hull.position.y = 1
  g.add(hull)
  const bow = new THREE.Mesh(new THREE.ConeGeometry(4, 6, 4), mat(0x30506b))
  bow.rotation.z = -Math.PI / 2
  bow.position.set(19, 1, 0)
  g.add(bow)
  const deck = new THREE.Mesh(new THREE.BoxGeometry(30, 0.4, 7.4), mat(0x8a6a4a))
  deck.position.y = 2.7
  g.add(deck)
  const house = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 6.4), mat(0xdfe4e8))
  house.position.set(-10, 4.8, 0)
  g.add(house)
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 3.4, 8), mat(0xb23b3b))
  funnel.position.set(-13, 8.4, 0)
  g.add(funnel)
  return g
}

/** A rowing boat with someone in it. */
function rowboat(): THREE.Group {
  const g = new THREE.Group()
  const hull = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.7, 1.3), mat(0x9a6a42))
  hull.position.y = 0.35
  g.add(hull)
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 0.35), mat(0x3a6ea5))
  body.position.y = 1.05
  g.add(body)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 5), mat(0xe0ac69))
  head.position.y = 1.6
  g.add(head)
  for (const z of [0.75, -0.75]) {
    const oar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.07, 0.07), mat(0x8a6a4a))
    oar.position.set(-0.3, 0.8, z)
    oar.rotation.x = z > 0 ? 0.35 : -0.35
    g.add(oar)
  }
  return g
}

/**
 * A mainsail: luff up the mast, foot along the boom, leech bellied out to
 * leeward. Three vertices and one face — the cheapest shape that still reads
 * as a sail rather than a flag, the same trick `birds.ts` uses for a wing.
 * Flat in the hull's XY plane, so it stands upright on the mast instead of
 * lying flat on the deck.
 */
function sailGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  const verts = [0, 0, 0, 0, 5.6, 0, -3.2, 0.6, 0]
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3))
  geo.computeVertexNormals()
  return geo
}

/**
 * A small sailing boat: hull, mast, and the sail that does the work of
 * reading as one at a distance — a hull this size is barely a pixel, the
 * sail is what stands out above the water.
 */
function sailboat(): THREE.Group {
  const g = new THREE.Group()
  const hull = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.9, 2), mat(0xdedad2))
  hull.position.y = 0.5
  g.add(hull)
  const bow = new THREE.Mesh(new THREE.ConeGeometry(1, 1.6, 4), mat(0xdedad2))
  bow.rotation.z = -Math.PI / 2
  bow.position.set(3.6, 0.5, 0)
  g.add(bow)
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 6, 6), mat(0x5c4630))
  mast.position.set(-0.5, 3.95, 0)
  g.add(mast)
  const sail = new THREE.Mesh(sailGeometry(), mat(0xf2efe6))
  sail.position.set(-0.5, 0.95, 0)
  g.add(sail)
  return g
}

/**
 * A motor yacht: white hull, a raised cabin, and a flying bridge above it —
 * a third the cargo ship's length, and read from the same distance by height
 * rather than bulk.
 */
function yacht(): THREE.Group {
  const g = new THREE.Group()
  const hull = new THREE.Mesh(new THREE.BoxGeometry(13, 1.6, 3.6), mat(0xe8e6df))
  hull.position.y = 0.8
  g.add(hull)
  const bow = new THREE.Mesh(new THREE.ConeGeometry(1.8, 3.2, 4), mat(0xe8e6df))
  bow.rotation.z = -Math.PI / 2
  bow.position.set(7.2, 0.8, 0)
  g.add(bow)
  const deck = new THREE.Mesh(new THREE.BoxGeometry(9, 0.3, 3.2), mat(0xcfd3d8))
  deck.position.y = 1.75
  g.add(deck)
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(5, 1.8, 2.8), mat(0xf5f3ee))
  cabin.position.set(-0.5, 2.8, 0)
  g.add(cabin)
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.1, 2.2), mat(0xdfe4e8))
  bridge.position.set(-0.5, 4.2, 0)
  g.add(bridge)
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 4.2, 6), mat(0x8a6a4a))
  rail.rotation.z = Math.PI / 2
  rail.position.set(-0.5, 3.65, 0)
  g.add(rail)
  return g
}

/**
 * The odd boat on the water.
 *
 * Each is placed at the widest point of a water body and circles there, which
 * keeps it off the banks without any navigation. What can go where is decided by
 * how much room the water actually has, not its area: a river can be a square
 * kilometre and forty metres wide, so a ship would be aground.
 */
export function createBoats(
  scene: THREE.Scene,
  water: Vec2[][],
  provider: ElevationProvider,
  rand: () => number = Math.random,
  maxBoats = 6,
): Boats {
  const group = new THREE.Group()
  scene.add(group)
  const rng = makeRng(0x5ea)
  const afloat: Afloat[] = []

  /**
   * Try to put one boat on this water, at the best spot it has left.
   *
   * @returns whether it managed it
   */
  const placeOne = (
    ring: Vec2[],
    level: number,
    ranked: { x: number; z: number; r: number }[],
    guaranteed: boolean,
  ): boolean => {
    // `spots()` already ranks them biggest-capable-first and nearest-the-middle
    // second, so working down the list fills the roomiest, most reachable water
    // first and thins out towards the map's edges only once the ceiling allows.
    while (ranked.length) {
      const spot = ranked.shift() as { x: number; z: number; r: number }
      const kind = kindFor(spot.r)
      // Checked at the hull's ends, over the whole patrol circuit — a 38m ship
      // turning about its middle reaches 19m out before it has gone anywhere.
      const radius = Math.min((spot.r - kind.half) * 0.5, MAX_CIRCLE)
      if (radius <= 1) continue
      if (!circleFits(ring, spot.x, spot.z, radius, kind.half)) continue
      if (!circleIsWet(spot.x, spot.z, radius, provider, level)) continue
      // Keep patrol circles apart — see BOAT_GAP — or a wide harbour's ranked
      // candidates, which cluster on its widest bend, stack several boats on
      // the same water.
      if (afloat.some((b) => Math.hypot(b.cx - spot.x, b.cz - spot.z) < b.radius + radius + BOAT_GAP)) continue

      // Not every spot that can take a boat gets one — but the FIRST one on each
      // stretch of water does. A city often has a single river or lake, and
      // rolling the dice on it meant the water was simply empty, which is what
      // it looked like. Only the extras are left to chance.
      if (!guaranteed && rand() > kind.showChance) continue

      const mesh = kind.build()
      mesh.userData.boatKind = kind.name
      group.add(mesh)
      afloat.push({
        mesh,
        cx: spot.x,
        cz: spot.z,
        radius,
        angle: rng() * Math.PI * 2,
        speed: kind.speed,
        turn: rng() < 0.5 ? 1 : -1,
      })
      mesh.position.y = level
      return true
    }
    return false
  }

  // One boat on each stretch of water before any stretch gets a second.
  //
  // Working a body dry before moving on lets one harbour eat the whole budget —
  // four boats on the river and none at all on the lake beside it, which is the
  // very complaint this started from. Round-robin instead: every water gets a
  // boat, then the leftovers go wherever there is still room. More water still
  // means more boats, since a canal runs out of spots after one and a harbour
  // does not.
  const bodies = water
    .filter((ring) => ring.length >= 3)
    .map((ring) => {
      const level = waterLevel(ring, provider)
      return { ring, level, ranked: spots(ring, provider, level) }
    })
    .filter((b) => b.ranked.length > 0)

  for (let pass = 0; afloat.length < maxBoats && bodies.length; pass++) {
    let placedAny = false
    for (const b of bodies) {
      if (afloat.length >= maxBoats) break
      if (placeOne(b.ring, b.level, b.ranked, pass === 0)) placedAny = true
    }
    if (!placedAny) break // every water is full or has nothing left to offer
  }

  let clock = 0
  return {
    setEnabled(on) {
      group.visible = on
    },
    dispose() {
      scene.remove(group)
      group.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose()
        const mm = m.material
        if (mm) (Array.isArray(mm) ? mm : [mm]).forEach((x) => x.dispose())
      })
      afloat.length = 0
    },
    update(dt) {
      clock += dt
      for (const b of afloat) {
        b.angle += (b.speed / Math.max(1, b.radius)) * dt * b.turn
        b.mesh.position.x = b.cx + Math.cos(b.angle) * b.radius
        b.mesh.position.z = b.cz + Math.sin(b.angle) * b.radius
        // Face along the circle, and roll gently — it's on water.
        b.mesh.rotation.y = -(b.angle + (Math.PI / 2) * b.turn)
        b.mesh.rotation.z = Math.sin(clock * 0.8 + b.angle) * 0.02
      }
    },
  }
}
