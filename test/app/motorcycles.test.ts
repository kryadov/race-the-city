import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createMotorcycles } from '../../src/app/motorcycles'
import type { Road, Vec2 } from '../../src/geo/types'

const v = (x: number, z: number): Vec2 => ({ x, z })
const flat = { heightAt: () => 0 }

/** A plus of two long roads crossing at the origin — plenty of room to ride. */
const grid: Road[] = [
  { points: [v(-500, 0), v(0, 0), v(500, 0)], kind: 'residential' },
  { points: [v(0, -500), v(0, 0), v(0, 500)], kind: 'residential' },
]

/** Every bike body group hung on the motorcycles' scene group. */
function motoGroups(scene: THREE.Scene): THREE.Group[] {
  const group = scene.children[0] as THREE.Group
  return group.children.filter((c) => c.userData.motorcycle) as THREE.Group[]
}

const posOf = (g: THREE.Group): THREE.Vector3 => g.position.clone()

describe('motorcycles', () => {
  it('puts bikes on the roads', () => {
    const scene = new THREE.Scene()
    const m = createMotorcycles(scene, grid, flat, () => 0.5)
    m.update(0.016, false)
    expect(motoGroups(scene).length).toBeGreaterThan(0)
  })

  it('exposes a solid obstacle circle per bike, at the bike, so the car cannot pass through', () => {
    const scene = new THREE.Scene()
    const m = createMotorcycles(scene, grid, flat, () => 0.5)
    m.update(0.016, false)
    const bikes = motoGroups(scene)
    expect(m.obstacles().length).toBe(bikes.length)
    // each circle sits on its bike
    for (const g of bikes) {
      const near = m.obstacles().some((c) => Math.hypot(c.x - g.position.x, c.z - g.position.z) < 0.01 && c.r > 0)
      expect(near).toBe(true)
    }
  })

  it('survives a city with no roads at all', () => {
    const scene = new THREE.Scene()
    const m = createMotorcycles(scene, [], flat, () => 0.5)
    expect(() => m.update(0.016, false)).not.toThrow()
    expect(motoGroups(scene).length).toBe(0)
  })

  it('rides them along the streets', () => {
    const scene = new THREE.Scene()
    const m = createMotorcycles(scene, grid, flat, () => 0.5)
    m.update(0.016, false)
    const before = motoGroups(scene).map(posOf)
    for (let f = 0; f < 120; f++) m.update(1 / 60, false)
    const after = motoGroups(scene).map(posOf)
    const moved = before.some((p, i) => p.distanceTo(after[i]) > 5)
    expect(moved).toBe(true)
  })

  it('keeps them near the roads, not out in the fields', () => {
    const scene = new THREE.Scene()
    const m = createMotorcycles(scene, grid, flat, () => 0.5)
    for (let f = 0; f < 300; f++) m.update(1 / 60, false)
    // Every road here lies on an axis, so a bike on one is within a lane offset
    // of x=0 or z=0 — never both large at once.
    for (const p of motoGroups(scene).map(posOf)) {
      expect(Math.min(Math.abs(p.x), Math.abs(p.z))).toBeLessThan(4.5)
    }
  })

  it('stands them on the terrain, sloped and all', () => {
    const hill = { heightAt: (x: number) => x * 0.2 }
    const scene = new THREE.Scene()
    const m = createMotorcycles(scene, grid, hill, () => 0.5)
    m.update(0.016, false)
    for (const g of motoGroups(scene)) {
      expect(g.position.y).toBeCloseTo(hill.heightAt(g.position.x), 3)
    }
  })

  it('lights the headlight at night and darkens it by day', () => {
    const scene = new THREE.Scene()
    const m = createMotorcycles(scene, grid, flat, () => 0.5)
    const lampOf = (): THREE.MeshStandardMaterial => {
      const bike = motoGroups(scene)[0]
      let found: THREE.MeshStandardMaterial | null = null
      bike.traverse((o) => {
        if (o.userData.bikeLamp) found = (o as THREE.Mesh).material as THREE.MeshStandardMaterial
      })
      return found!
    }
    m.update(0.016, false)
    expect(lampOf().emissiveIntensity).toBe(0)
    m.update(0.016, true)
    expect(lampOf().emissiveIntensity).toBeGreaterThan(0)
  })

  it('lays out the same bikes every load, given the same randomness', () => {
    const build = (): THREE.Vector3[] => {
      const scene = new THREE.Scene()
      const m = createMotorcycles(scene, grid, flat, () => 0.5)
      for (let f = 0; f < 200; f++) m.update(1 / 60, false)
      return motoGroups(scene).map(posOf)
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
    const m = createMotorcycles(scene, grid, flat, () => 0.5)
    expect(scene.children.length).toBe(1)
    m.dispose()
    expect(scene.children.length).toBe(0)
  })
})
