import * as THREE from 'three'
import type { Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import { roomAt } from '../world/area'
import { waterLevel } from '../world/water'
import { pointInPolygon } from '../physics/collide'

/** A ship needs this much clear water around it, in metres. */
const SHIP_ROOM = 55
/** A rowing boat is happy on anything from a pond up. */
const ROWBOAT_ROOM = 14
/** Half the length of each hull — what has to stay wet, not just its centre. */
const SHIP_HALF = 19
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
const ROWBOAT_HALF = 2.4
const SHIP_SPEED = 4.5
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
/** How many of the roomiest spots to try before giving this water up. */
const CANDIDATES = 40

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
  // Roomy enough for a ship first, and among those the nearest to the middle —
  // not simply the roomiest, which on a river is always its widest bend out at
  // the map's corner, where a ship is technically afloat and practically absent.
  const rank = (p: { x: number; z: number; r: number }): number =>
    (p.r >= SHIP_ROOM ? 0 : 1e6) + Math.hypot(p.x, p.z)
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

  for (const ring of water) {
    if (afloat.length >= maxBoats) break
    if (ring.length < 3) continue
    const level = waterLevel(ring, provider)

    // Take the roomiest spot whose circuit is genuinely afloat all the way
    // round — the hull's ends included, since a 38m ship turning about its
    // middle reaches 19m out before it has gone anywhere.
    let put: { x: number; z: number; radius: number; big: boolean } | null = null
    for (const spot of spots(ring, provider, level)) {
      const big = spot.r >= SHIP_ROOM
      const half = big ? SHIP_HALF : ROWBOAT_HALF
      const radius = Math.min((spot.r - half) * 0.5, MAX_CIRCLE)
      if (radius <= 1) continue
      if (!circleFits(ring, spot.x, spot.z, radius, half)) continue
      if (!circleIsWet(spot.x, spot.z, radius, provider, level)) continue
      put = { x: spot.x, z: spot.z, radius, big }
      break
    }
    if (!put) continue

    // Not every stretch of water has a boat on it — but the first one that can
    // take one does. A city often has a single river or lake, and rolling the
    // dice on it meant the water was simply empty, which is what it looked like.
    if (afloat.length && rand() > (put.big ? 0.75 : 0.4)) continue

    const mesh = put.big ? ship() : rowboat()
    group.add(mesh)
    afloat.push({
      mesh,
      cx: put.x,
      cz: put.z,
      radius: put.radius,
      angle: rng() * Math.PI * 2,
      speed: put.big ? SHIP_SPEED : ROW_SPEED,
      turn: rng() < 0.5 ? 1 : -1,
    })
    mesh.position.y = level
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
