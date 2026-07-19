import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createBuses } from '../../src/app/buses'
import type { Road, Vec2 } from '../../src/geo/types'

const v = (x: number, z: number): Vec2 => ({ x, z })
const flat = { heightAt: () => 0 }

/** A plus of two long roads crossing at the origin — plenty of room to drive. */
const grid: Road[] = [
  { points: [v(-500, 0), v(0, 0), v(500, 0)], kind: 'residential' },
  { points: [v(0, -500), v(0, 0), v(0, 500)], kind: 'residential' },
]

/** A single straight road, finely mapped, with a stop partway along it. */
const straight: Road[] = [
  { points: Array.from({ length: 41 }, (_, i) => v(-400 + i * 20, 0)), kind: 'residential' },
]

/** Every bus body group hung on the buses' scene group. */
function busGroups(scene: THREE.Scene): THREE.Group[] {
  const group = scene.children[0] as THREE.Group
  return group.children.filter((c) => c.userData.bus) as THREE.Group[]
}

/** Every figure group (across every stop), for reading their fade. */
function figureGroups(scene: THREE.Scene): THREE.Group[] {
  const group = scene.children[0] as THREE.Group
  const out: THREE.Group[] = []
  group.children
    .filter((c) => c.userData.platform)
    .forEach((p) => p.children.forEach((f) => out.push(f as THREE.Group)))
  return out
}

const posOf = (g: THREE.Group): THREE.Vector3 => g.position.clone()

describe('buses', () => {
  it('puts buses on the roads', () => {
    const scene = new THREE.Scene()
    const b = createBuses(scene, grid, [], flat, () => 0.5)
    b.update(0.016, false)
    expect(busGroups(scene).length).toBeGreaterThan(0)
  })

  it('survives a city with no roads at all', () => {
    const scene = new THREE.Scene()
    const b = createBuses(scene, [], [], flat, () => 0.5)
    expect(() => b.update(0.016, false)).not.toThrow()
    expect(busGroups(scene).length).toBe(0)
  })

  it('drives them along the streets', () => {
    const scene = new THREE.Scene()
    // No stops, so they only ever drive — nothing to halt them.
    const b = createBuses(scene, grid, [], flat, () => 0.5)
    b.update(0.016, false)
    const before = busGroups(scene).map(posOf)
    for (let f = 0; f < 120; f++) b.update(1 / 60, false)
    const after = busGroups(scene).map(posOf)
    const moved = before.some((p, i) => p.distanceTo(after[i]) > 5)
    expect(moved).toBe(true)
  })

  it('keeps them near the roads, not out in the fields', () => {
    const scene = new THREE.Scene()
    const b = createBuses(scene, grid, [], flat, () => 0.5)
    for (let f = 0; f < 300; f++) b.update(1 / 60, false)
    // Every road here lies on an axis, so a bus on one is within a lane-offset
    // of x=0 or z=0 — never both large at once.
    for (const p of busGroups(scene).map(posOf)) {
      expect(Math.min(Math.abs(p.x), Math.abs(p.z))).toBeLessThan(4.5)
    }
  })

  it('pauses at a bus stop', () => {
    const scene = new THREE.Scene()
    // One bus, one road, one stop at the origin: it must drive there and halt.
    const b = createBuses(scene, straight, [v(0, 0)], flat, () => 0.5, 1)
    const bus = busGroups(scene)[0]
    expect(bus).toBeDefined()

    let halted = false
    let still = 0
    let last = posOf(bus)
    // Long enough to reach the middle from anywhere on the road and settle.
    for (let f = 0; f < 4000; f++) {
      b.update(1 / 60, false)
      const now = posOf(bus)
      const near = Math.hypot(now.x, now.z) < 12 // in the neighbourhood of the stop
      if (near && now.distanceTo(last) < 0.02) {
        still++
        if (still > 60) halted = true // ~1s stationary at the kerb
      } else {
        still = 0
      }
      last = now
    }
    expect(halted, 'the bus never paused at its stop').toBe(true)
  })

  it('gathers figures at the stop while a bus is in, and clears them once it leaves', () => {
    const scene = new THREE.Scene()
    const b = createBuses(scene, straight, [v(0, 0)], flat, () => 0.5, 1)
    const bus = busGroups(scene)[0]

    const figScale = (): number =>
      Math.max(0, ...figureGroups(scene).map((f) => f.scale.x))

    let seenAtStop = 0 // biggest figure while the bus is halted at the kerb
    let seenDriving = 0 // biggest figure while it's driving, well clear of the stop
    let last = posOf(bus)
    for (let f = 0; f < 4000; f++) {
      b.update(1 / 60, false)
      const now = posOf(bus)
      const paused = now.distanceTo(last) < 0.02 && Math.hypot(now.x, now.z) < 12
      if (paused) seenAtStop = Math.max(seenAtStop, figScale())
      if (now.distanceTo(last) > 0.05 && Math.hypot(now.x, now.z) > 60) {
        seenDriving = Math.max(seenDriving, figScale())
      }
      last = now
    }
    expect(seenAtStop, 'no figures ever appeared at the stop').toBeGreaterThan(0.3)
    expect(seenDriving, 'figures lingered after the bus drove off').toBeLessThan(0.05)
  })

  it('stands them on the terrain, sloped and all', () => {
    const hill = { heightAt: (x: number) => x * 0.2 }
    const scene = new THREE.Scene()
    const b = createBuses(scene, grid, [], hill, () => 0.5)
    b.update(0.016, false)
    for (const g of busGroups(scene)) {
      // Its foot sits on the hill, not at y=0.
      expect(g.position.y).toBeCloseTo(hill.heightAt(g.position.x), 3)
      // And it's tilted to the slope, not held dead level.
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(g.quaternion)
      expect(up.y).toBeLessThan(0.999)
    }
  })

  it('lights the windows at night and darkens them by day', () => {
    const scene = new THREE.Scene()
    const b = createBuses(scene, grid, [], flat, () => 0.5)
    const glassOf = (): THREE.MeshStandardMaterial => {
      const bus = busGroups(scene)[0]
      let found: THREE.MeshStandardMaterial | null = null
      bus.traverse((o) => {
        if (o.userData.busGlass) found = (o as THREE.Mesh).material as THREE.MeshStandardMaterial
      })
      return found!
    }
    b.update(0.016, false)
    expect(glassOf().emissiveIntensity).toBe(0)
    b.update(0.016, true)
    expect(glassOf().emissiveIntensity).toBeGreaterThan(0)
  })

  it('lays out the same buses every load, given the same randomness', () => {
    const build = (): THREE.Vector3[] => {
      const scene = new THREE.Scene()
      const b = createBuses(scene, grid, [v(120, 0), v(0, 120)], flat, () => 0.5)
      for (let f = 0; f < 200; f++) b.update(1 / 60, false)
      return busGroups(scene).map(posOf)
    }
    const a = build()
    const c = build()
    expect(a.length).toBe(c.length)
    for (let i = 0; i < a.length; i++) {
      expect(a[i].distanceTo(c[i])).toBeLessThan(1e-6)
    }
  })

  it('clears off the scene when the city changes', () => {
    const scene = new THREE.Scene()
    const b = createBuses(scene, grid, [v(0, 0)], flat, () => 0.5)
    expect(scene.children.length).toBe(1)
    b.dispose()
    expect(scene.children.length).toBe(0)
  })
})
