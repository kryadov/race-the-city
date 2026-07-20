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
  phase: number // where in its rowing stroke a rowboat starts, so they're not in lockstep
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

/**
 * The rowboat's hull in cross-section, stem to stern (−x aft, +x bow).
 *
 * Each station gives a half-beam at the gunwale (topHalf) and at the bilge
 * (botHalf), plus the height of each — the sheer line (topY) and the bottom
 * (botY). Both half-beams fall to zero at the ends so the planking closes to a
 * point fore and aft (a double-ender, pointed bow AND stern, not a box with a
 * cone stuck on), the sheer lifts towards those ends for the classic upswept
 * look, and the bottom rockers up clear of the water there while dipping below
 * the waterline amidships — the group sits at y = 0 on the water, so a keel that
 * goes negative is a boat sitting IN the water rather than on a slab above it.
 *
 * Static and shared by both the hull surface and its caprail, so the geometry is
 * built once and a rowboat is the same rowboat every reload.
 */
const ROWBOAT_STATIONS = [
  { x: -1.7, topHalf: 0.0, botHalf: 0.0, topY: 0.58, botY: 0.22 },
  { x: -1.25, topHalf: 0.34, botHalf: 0.16, topY: 0.5, botY: -0.02 },
  { x: -0.5, topHalf: 0.5, botHalf: 0.26, topY: 0.47, botY: -0.12 },
  { x: 0.35, topHalf: 0.49, botHalf: 0.25, topY: 0.47, botY: -0.11 },
  { x: 1.15, topHalf: 0.33, botHalf: 0.15, topY: 0.51, botY: 0.0 },
  { x: 1.9, topHalf: 0.0, botHalf: 0.0, topY: 0.6, botY: 0.22 },
]

/**
 * The tapered hull surface: two flaring topsides and a bottom lofted between the
 * stations, closing to a point at each end. The top is left open — no deck quad
 * across the beam — so the boat reads as a shell you sit in, which is the whole
 * difference between a hull and a wooden wedge.
 */
function rowboatHull(): THREE.BufferGeometry {
  const S = ROWBOAT_STATIONS
  const verts: number[] = []
  for (const s of S) {
    // Four corners per station: gunwale L/R at the sheer, bilge L/R at the bottom.
    verts.push(s.x, s.topY, s.topHalf, s.x, s.topY, -s.topHalf)
    verts.push(s.x, s.botY, s.botHalf, s.x, s.botY, -s.botHalf)
  }
  const idx: number[] = []
  for (let i = 0; i < S.length - 1; i++) {
    const a = i * 4
    const b = (i + 1) * 4
    const gLa = a, gRa = a + 1, bLa = a + 2, bRa = a + 3
    const gLb = b, gRb = b + 1, bLb = b + 2, bRb = b + 3
    idx.push(gLa, bLa, bLb, gLa, bLb, gLb) // left topside
    idx.push(gRa, gRb, bRb, gRa, bRb, bRa) // right topside
    idx.push(bLa, bRa, bRb, bLa, bRb, bLb) // bottom
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return geo
}

/**
 * A caprail hugging the sheer, a shade darker than the planking — the gunwale
 * line that finishes the open top. Built from the same stations, so it follows
 * the taper and pinches to nothing at bow and stern with the hull.
 */
function rowboatRail(): THREE.BufferGeometry {
  const S = ROWBOAT_STATIONS
  const inset = 0.12 // how far in from the sheer edge the flat of the rail reaches
  const verts: number[] = []
  for (const s of S) {
    const inner = Math.max(0, s.topHalf - inset)
    verts.push(s.x, s.topY, s.topHalf, s.x, s.topY, inner)
    verts.push(s.x, s.topY, -inner, s.x, s.topY, -s.topHalf)
  }
  const idx: number[] = []
  for (let i = 0; i < S.length - 1; i++) {
    const a = i * 4
    const b = (i + 1) * 4
    idx.push(a, a + 1, b + 1, a, b + 1, b) // left rail band
    idx.push(a + 3, b + 3, b + 2, a + 3, b + 2, a + 2) // right rail band
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return geo
}

/**
 * A rowing boat with someone pulling at the oars, pointing +x.
 *
 * A proper tapered low-poly hull — pointed bow and stern, a flaring topside over
 * a shallow bottom, an upswept sheer capped by a darker gunwale rail, and an
 * open top you can see down into (see ROWBOAT_STATIONS). Amidships sits a blocky
 * figure — cut from the same cloth as the taxi's little people — with an oar to
 * hand, on a thwart, and a second thwart forward for the look of it.
 *
 * The rower and the two oars hang off `userData` so `update` can drive the
 * stroke. Each oar is a child pivot at its oarlock, so one rotation of the pivot
 * swings the whole oar about the gunwale without touching a vertex; `side`
 * (+1 starboard, -1 port) places each and keeps the pair mirror-symmetric.
 * `hull` is kept on `userData` too so a test can prove the taper.
 */
function rowboat(): THREE.Group {
  const g = new THREE.Group()
  const wood = 0x9a6a42
  const trim = 0x7c542f // gunwale and thwarts, a shade darker than the planking

  // Open along the top, so every hull panel is seen from both faces — hence
  // DoubleSide, the price of looking like a boat you sit in from any angle
  // rather than a shell that vanishes the moment you glance down into it.
  const hull = new THREE.Mesh(
    rowboatHull(),
    new THREE.MeshStandardMaterial({ color: wood, flatShading: true, side: THREE.DoubleSide }),
  )
  g.add(hull)
  const rail = new THREE.Mesh(
    rowboatRail(),
    new THREE.MeshStandardMaterial({ color: trim, flatShading: true, side: THREE.DoubleSide }),
  )
  g.add(rail)

  // Two thwarts: the seat the rower is on amidships, and one forward — shorter,
  // since the hull has narrowed by the time it gets there.
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.9), mat(trim))
  seat.position.set(-0.1, 0.44, 0)
  g.add(seat)
  const fwd = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.7), mat(trim))
  fwd.position.set(0.85, 0.46, 0)
  g.add(fwd)

  // The rower, in its own group so `update` can rock it fore-and-aft with the
  // stroke: torso, head, and two arms reaching out to the oar handles.
  const rower = new THREE.Group()
  rower.position.set(-0.1, 0.44, 0)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.6, 0.4), mat(0x3a6ea5))
  torso.position.y = 0.3
  rower.add(torso)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 5), mat(0xe0ac69))
  head.position.y = 0.72
  rower.add(head)
  for (const side of [1, -1]) {
    const armGeo = new THREE.BoxGeometry(0.1, 0.5, 0.1)
    armGeo.translate(0, -0.25, 0) // pivot at the shoulder end
    const arm = new THREE.Mesh(armGeo, mat(0x3a6ea5))
    arm.position.set(0, 0.55, side * 0.18)
    arm.rotation.z = 0.8 // slung forward-and-down towards the handles
    rower.add(arm)
  }
  g.add(rower)

  // An oar to each side, each on a pivot at its oarlock. The shaft lies outboard
  // along z with the handle inboard by the rower's hands and the blade at the
  // far end; the pivot sits between them, so pulling the handle one way swings
  // the blade the other, exactly as an oar does.
  const oars: THREE.Group[] = []
  for (const side of [1, -1]) {
    const pivot = new THREE.Group()
    pivot.position.set(-0.1, 0.5, side * 0.55)
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.3, 5), mat(trim))
    shaft.rotation.x = Math.PI / 2 // stand the cylinder up along z
    shaft.position.z = side * 0.75 // handle inboard, blade reaching outboard
    pivot.add(shaft)
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.5), mat(wood))
    blade.position.z = side * 1.85
    pivot.add(blade)
    pivot.userData.side = side
    g.add(pivot)
    oars.push(pivot)
  }

  g.userData.hull = hull
  g.userData.rower = rower
  g.userData.oars = oars
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
  group.userData.neonMover = 'bot' // neon flips the boats to wireframe like the road traffic
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
        phase: rng() * Math.PI * 2,
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

        // Pull the oars, on the boats that carry any. One phase drives the lot:
        // the pair sweep fore-and-aft together and dip a quarter-cycle later, so
        // a blade bites as it swings through and lifts clear on the way back,
        // while the rower leans the way the handles travel. `side` mirrors port
        // to starboard; each oar turns about its own oarlock pivot.
        const oars = b.mesh.userData.oars as THREE.Group[] | undefined
        if (oars) {
          const s = clock * 2.4 + b.phase
          const sweep = Math.sin(s) * 0.5
          const dip = Math.cos(s) * 0.3
          for (const oar of oars) {
            const side = oar.userData.side as number
            oar.rotation.y = -side * sweep
            oar.rotation.x = side * dip
          }
          ;(b.mesh.userData.rower as THREE.Group).rotation.z = -sweep * 0.6
        }
      }
    },
  }
}
