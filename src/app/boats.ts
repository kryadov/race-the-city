import * as THREE from 'three'
import type { Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import { inradius } from '../world/area'
import { waterLevel } from '../world/water'

/** A ship needs this much clear water around it, in metres. */
const SHIP_ROOM = 55
/** A rowing boat is happy on anything from a pond up. */
const ROWBOAT_ROOM = 14
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
): Boats {
  const group = new THREE.Group()
  scene.add(group)
  const rng = makeRng(0x5ea)
  const afloat: Afloat[] = []

  for (const ring of water) {
    if (ring.length < 3) continue
    const fit = inradius(ring)
    if (fit.r < ROWBOAT_ROOM) continue // a puddle
    const big = fit.r >= SHIP_ROOM
    if (rand() > (big ? 0.75 : 0.4)) continue // not every stretch has one

    const mesh = big ? ship() : rowboat()
    group.add(mesh)
    afloat.push({
      mesh,
      cx: fit.x,
      cz: fit.z,
      // Circle well inside the widest point, so it never touches the bank.
      radius: fit.r * 0.45,
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
