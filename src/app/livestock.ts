import * as THREE from 'three'
import type { Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import { inradius, ringArea } from '../world/area'

export type Beast = 'cow' | 'goat' | 'pig'

/** A field smaller than this is somebody's lawn, not a pasture. */
const MIN_FIELD = 1200 // m²
/** And it needs actual room, not just area — a hedgerow strip won't do. */
const MIN_ROOM = 12
const PER_FIELD = 5

const SHAPES: Record<Beast, { body: [number, number, number]; legs: number; color: number; head: number }> = {
  cow: { body: [1.9, 1.0, 0.75], legs: 0.75, color: 0x2e2b28, head: 0.34 },
  goat: { body: [1.0, 0.55, 0.42], legs: 0.5, color: 0xcfc6b4, head: 0.2 },
  pig: { body: [1.2, 0.65, 0.55], legs: 0.32, color: 0xd79a9a, head: 0.24 },
}

export interface Livestock {
  update(dt: number): void
  setEnabled(on: boolean): void
  dispose(): void
}

interface Animal {
  x: number
  z: number
  angle: number
  /** Seconds until it wanders somewhere else. Mostly it stands and eats. */
  idle: number
  home: { x: number; z: number; r: number }
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

/**
 * Cows, goats and pigs in the fields.
 *
 * Which fields is decided by room as well as area: a 2000m² strip of hedgerow
 * has the area of a paddock and none of the space, and a cow standing in a
 * hedge reads worse than an empty field. Each animal keeps within a circle
 * inside the field, so none of them wander onto the road.
 */
export function createLivestock(
  scene: THREE.Scene,
  fields: Vec2[][],
  provider: ElevationProvider,
  rand: () => number = Math.random,
): Livestock {
  const group = new THREE.Group()
  scene.add(group)
  const rng = makeRng(0xfa2b17)
  const kinds = Object.keys(SHAPES) as Beast[]
  const herds: { kind: Beast; animals: Animal[]; meshes: THREE.Group[] }[] = []

  for (const ring of fields) {
    if (Math.abs(ringArea(ring)) < MIN_FIELD) continue
    const fit = inradius(ring)
    if (fit.r < MIN_ROOM) continue
    if (rand() > 0.55) continue // not every field is stocked

    const kind = kinds[Math.floor(rand() * kinds.length)]
    const animals: Animal[] = []
    const meshes: THREE.Group[] = []
    const n = 2 + Math.floor(rand() * (PER_FIELD - 1))
    for (let i = 0; i < n; i++) {
      const home = { x: fit.x, z: fit.z, r: fit.r * 0.7 }
      const a: Animal = {
        x: fit.x + (rng() - 0.5) * home.r,
        z: fit.z + (rng() - 0.5) * home.r,
        angle: rng() * Math.PI * 2,
        idle: rng() * 8,
        home,
      }
      const mesh = beast(kind)
      group.add(mesh)
      animals.push(a)
      meshes.push(mesh)
    }
    herds.push({ kind, animals, meshes })
  }

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
      herds.length = 0
    },
    update(dt) {
      for (const herd of herds) {
        herd.animals.forEach((a, i) => {
          a.idle -= dt
          if (a.idle <= 0) {
            // Amble a step, then go back to eating.
            a.angle = rng() * Math.PI * 2
            const step = 1 + rng() * 3
            const nx = a.x + Math.cos(a.angle) * step
            const nz = a.z + Math.sin(a.angle) * step
            if (Math.hypot(nx - a.home.x, nz - a.home.z) < a.home.r) {
              a.x = nx
              a.z = nz
            }
            a.idle = 4 + rng() * 10
          }
          const m = herd.meshes[i]
          m.position.set(a.x, provider.heightAt(a.x, a.z), a.z)
          m.rotation.y = -a.angle
        })
      }
    },
  }
}

function beast(kind: Beast): THREE.Group {
  const s = SHAPES[kind]
  const g = new THREE.Group()
  const mat = (c: number): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({ color: c, flatShading: true })
  const body = new THREE.Mesh(new THREE.BoxGeometry(s.body[0], s.body[1], s.body[2]), mat(s.color))
  body.position.y = s.legs + s.body[1] / 2
  g.add(body)
  const head = new THREE.Mesh(new THREE.BoxGeometry(s.head * 1.6, s.head, s.head), mat(s.color))
  head.position.set(s.body[0] / 2 + s.head * 0.5, s.legs + s.body[1] * 0.75, 0)
  g.add(head)
  const legGeo = new THREE.BoxGeometry(s.head * 0.4, s.legs, s.head * 0.4)
  for (const x of [s.body[0] * 0.3, -s.body[0] * 0.3]) {
    for (const z of [s.body[2] * 0.3, -s.body[2] * 0.3]) {
      const leg = new THREE.Mesh(legGeo, mat(0x2a2622))
      leg.position.set(x, s.legs / 2, z)
      g.add(leg)
    }
  }
  return g
}
