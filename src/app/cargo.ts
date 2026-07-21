import * as THREE from 'three'
import type { CarState } from '../vehicle/car'
import type { VehicleType } from '../vehicle/vehicles'

// The load a delivery is carrying, shown riding on the player's vehicle while a
// fare is aboard (the taxi/deliver mode's `toDropoff` leg). What it carries follows
// the hull: a car takes a passenger, a sleek/status car a smartly-dressed one, and
// the working haulers each take the bulk load that suits them.

export type CargoKind = 'person' | 'vip' | 'sand' | 'gravel' | 'fuel' | 'milk'

// Only the vehicles that carry something other than an ordinary passenger are
// listed; everything else (plain cars, the bus, the exotics) falls back to a
// person. Kept as one table so a new vehicle is a single line.
const CARGO: Partial<Record<VehicleType, CargoKind>> = {
  sports: 'vip',
  racecar: 'vip',
  cabrio: 'vip',
  pickup: 'sand', // the open tray
  truck: 'gravel',
  lorry: 'gravel',
  crane: 'gravel',
  roller: 'gravel',
  tanker: 'fuel',
  tractor: 'milk', // a farm run
  combine: 'milk',
  tiller: 'milk',
}

/** What a given vehicle hauls on a delivery. Pure — the mapping the tests lock. */
export function cargoFor(type: VehicleType): CargoKind {
  return CARGO[type] ?? 'person'
}

/** Where a load rides on the car: `y` metres up, `back` metres behind centre. */
export interface CargoAnchor {
  y: number
  back: number
}

/**
 * Where the load sits on the vehicle. A seated passenger rides low and near the
 * middle (the cabin); a bulk load rides higher and further back, over a hauler's
 * bed. Pure, so the placement is testable without a scene.
 */
export function cargoAnchor(kind: CargoKind): CargoAnchor {
  return kind === 'person' || kind === 'vip' ? { y: 0.55, back: 0.1 } : { y: 1.15, back: 0.7 }
}

const std = (color: number): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, flatShading: true })

const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material): THREE.Mesh => {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
  b.position.set(x, y, z)
  return b
}

/** A compact seated figure — lap, torso and head — authored with its base at y = 0. */
function figure(suit: boolean): THREE.Group {
  const g = new THREE.Group()
  const shirt = std(suit ? 0x2a2f3a : 0x3a6ea5) // a dark suit, or an everyday shirt
  const skin = std(0xd0a878)
  const legs = std(suit ? 0x20242e : 0x394049)
  g.add(
    box(0.42, 0.26, 0.5, 0, 0.13, 0.06, legs), // lap/thighs, knees forward
    box(0.44, 0.5, 0.28, 0, 0.5, -0.06, shirt), // torso, sat upright
    box(0.24, 0.24, 0.24, 0, 0.87, -0.06, skin), // head
  )
  if (suit) g.add(box(0.3, 0.08, 0.3, 0, 1.02, -0.06, std(0x14161d))) // a smart hat brim
  return g
}

/** A low heap (sand/gravel): a squat cone so it reads as a loose pile, base at y = 0. */
function heap(color: number, radius: number): THREE.Group {
  const g = new THREE.Group()
  const m = new THREE.Mesh(new THREE.ConeGeometry(radius, 0.5, 8), std(color))
  m.position.y = 0.25
  g.add(m)
  return g
}

/** An upright drum/churn: a cylinder with a banded top, base at y = 0. */
function barrel(body: number, band: number, radius: number): THREE.Group {
  const g = new THREE.Group()
  const h = 0.9
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, h, 12), std(body))
  drum.position.y = h / 2
  const top = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.02, radius * 1.02, 0.14, 12), std(band))
  top.position.y = h - 0.05
  g.add(drum, top)
  return g
}

function buildCargo(kind: CargoKind): THREE.Group {
  switch (kind) {
    case 'person':
      return figure(false)
    case 'vip':
      return figure(true)
    case 'sand':
      return heap(0xd8c48a, 0.7)
    case 'gravel':
      return heap(0x8a8f96, 0.7)
    case 'fuel':
      return barrel(0xb03027, 0x2b2e33, 0.36) // a red fuel drum
    case 'milk':
      return barrel(0xc9ced4, 0x9aa0a8, 0.32) // a steel milk churn
  }
}

const KINDS: readonly CargoKind[] = ['person', 'vip', 'sand', 'gravel', 'fuel', 'milk']

export interface CargoRider {
  /**
   * Show (or hide) the load riding on the car. `carrying` is true only while a
   * fare is aboard; the load is placed on the vehicle by `type` at the car's pose.
   */
  update(car: CarState, type: VehicleType, carrying: boolean): void
  dispose(): void
}

/**
 * The load that rides on the player's vehicle during a delivery. Every kind of
 * load is built once and kept hidden, so the neon theme scan (which runs on toggle
 * and on `refreshMovers`) always covers them — a load shown mid-drive is already in
 * whatever style is current. Only visibility and the pose change per frame.
 */
export function createCargoRider(scene: THREE.Scene): CargoRider {
  const group = new THREE.Group()
  group.visible = false
  group.userData.neonMover = 'bot' // neon flips the load to wireframe like the traffic
  const meshes = new Map<CargoKind, THREE.Group>()
  for (const kind of KINDS) {
    const m = buildCargo(kind)
    m.visible = false
    meshes.set(kind, m)
    group.add(m)
  }
  scene.add(group)

  return {
    update(car, type, carrying) {
      if (!carrying) {
        group.visible = false
        return
      }
      group.visible = true
      const kind = cargoFor(type)
      for (const [k, m] of meshes) m.visible = k === kind
      const anchor = cargoAnchor(kind)
      const fx = Math.cos(car.heading)
      const fz = Math.sin(car.heading)
      group.position.set(car.x - fx * anchor.back, car.y + anchor.y, car.z - fz * anchor.back)
      group.rotation.y = -car.heading // author faces +x; match the car's forward
    },
    dispose() {
      group.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.geometry) m.geometry.dispose()
        const mm = m.material
        if (mm) (Array.isArray(mm) ? mm : [mm]).forEach((x) => x.dispose())
      })
      scene.remove(group)
    },
  }
}
