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
 * How far out to look for water, and how finely — metres. The scene's fog closes
 * at 900m, so a boat beyond that is a boat nobody will ever see.
 */
const LOOK = 900
const LOOK_STEP = 40

/**
 * The widest spot in this water that is actually within sight of the city.
 *
 * Not the widest spot outright: for a sea running along the edge of the map
 * that is a mile offshore, and the ship was out there — afloat, correct and
 * completely invisible. Not the nearest spot with any room either: that is
 * always hard against the near bank, where only a rowboat fits, so a lake with
 * a ship's worth of water in the middle of it got a dinghy at the shoreline.
 * The widest water you can see from the city is the one you want.
 */
export function spotNearMiddle(ring: Vec2[]): { x: number; z: number; r: number } | null {
  let best: { x: number; z: number; r: number } | null = null
  for (let x = -LOOK; x <= LOOK; x += LOOK_STEP) {
    for (let z = -LOOK; z <= LOOK; z += LOOK_STEP) {
      if (Math.hypot(x, z) > LOOK) continue
      const r = roomAt(ring, x, z)
      if (r < ROWBOAT_ROOM || (best && r <= best.r)) continue
      best = { x, z, r }
    }
  }
  return best
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
    const fit = spotNearMiddle(ring)
    if (!fit) continue // a puddle, or nothing but open water miles off the map
    const big = fit.r >= SHIP_ROOM
    // Not every stretch of water has a boat on it — but the first one that can
    // take one does. A city often has a single river or lake, and rolling the
    // dice on it meant the water was simply empty, which is what it looked like.
    if (afloat.length && rand() > (big ? 0.75 : 0.4)) continue

    // The hull has to stay wet, not just the point it turns about: a 38m ship
    // spinning about its middle reaches 19m out before it has gone anywhere.
    const half = big ? SHIP_HALF : ROWBOAT_HALF
    const radius = (fit.r - half) * 0.5
    if (radius <= 1) continue

    // And prove it: walk the circle and check the hull's ends are still in the
    // water. inradius fits the biggest circle it can find, but a ring that came
    // out of the data misshapen can put that circle somewhere silly — and a ship
    // on a field is worse than no ship.
    if (!circleFits(ring, fit.x, fit.z, radius, half)) continue

    const mesh = big ? ship() : rowboat()
    group.add(mesh)
    afloat.push({
      mesh,
      cx: fit.x,
      cz: fit.z,
      radius,
      angle: rng() * Math.PI * 2,
      speed: big ? SHIP_SPEED : ROW_SPEED,
      turn: rng() < 0.5 ? 1 : -1,
    })
    const level = waterLevel(ring, provider)
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
