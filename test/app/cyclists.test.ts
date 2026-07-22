import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createCyclists, cyclewayNodes } from '../../src/app/cyclists'
import { buildRoadGraph } from '../../src/world/roadGraph'
import type { Road, Vec2 } from '../../src/geo/types'

const v = (x: number, z: number): Vec2 => ({ x, z })
const flat = { heightAt: () => 0 }

/** A plus of two long roads crossing at the origin — plenty of room to ride. */
const grid: Road[] = [
  { points: [v(-500, 0), v(0, 0), v(500, 0)], kind: 'residential' },
  { points: [v(0, -500), v(0, 0), v(0, 500)], kind: 'residential' },
]

/** Every bike body group hung on the cyclists' scene group. */
function cyclistGroups(scene: THREE.Scene): THREE.Group[] {
  const group = scene.children[0] as THREE.Group
  return group.children.filter((c) => c.userData.cyclist) as THREE.Group[]
}

const posOf = (g: THREE.Group): THREE.Vector3 => g.position.clone()

describe('cyclists', () => {
  it('puts riders on the roads', () => {
    const scene = new THREE.Scene()
    const c = createCyclists(scene, grid, flat, () => 0.5)
    c.update(0.016, false)
    expect(cyclistGroups(scene).length).toBeGreaterThan(0)
  })

  it('survives a city with no roads at all', () => {
    const scene = new THREE.Scene()
    const c = createCyclists(scene, [], flat, () => 0.5)
    expect(() => c.update(0.016, false)).not.toThrow()
    expect(cyclistGroups(scene).length).toBe(0)
    expect(c.obstacles()).toEqual([]) // no riders → nothing solid
  })

  it('exposes a solid obstacle circle per rider so the car cannot pass through', () => {
    const scene = new THREE.Scene()
    const c = createCyclists(scene, grid, flat, () => 0.5)
    c.update(0.016, false)
    const riders = cyclistGroups(scene)
    expect(riders.length).toBeGreaterThan(0)
    expect(c.obstacles().length).toBe(riders.length)
    for (const g of riders) {
      expect(c.obstacles().some((o) => Math.hypot(o.x - g.position.x, o.z - g.position.z) < 0.01 && o.r > 0)).toBe(true)
    }
  })

  it('rides them along the streets', () => {
    const scene = new THREE.Scene()
    const c = createCyclists(scene, grid, flat, () => 0.5)
    c.update(0.016, false)
    const before = cyclistGroups(scene).map(posOf)
    // Riders are slow, so give them a good while to cover ground.
    for (let f = 0; f < 600; f++) c.update(1 / 60, false)
    const after = cyclistGroups(scene).map(posOf)
    const moved = before.some((p, i) => p.distanceTo(after[i]) > 5)
    expect(moved).toBe(true)
  })

  it('keeps them near the roads, not out in the fields', () => {
    const scene = new THREE.Scene()
    const c = createCyclists(scene, grid, flat, () => 0.5)
    for (let f = 0; f < 600; f++) c.update(1 / 60, false)
    // Every road here lies on an axis, so a rider on one is within a lane offset
    // of x=0 or z=0 — never both large at once.
    for (const p of cyclistGroups(scene).map(posOf)) {
      expect(Math.min(Math.abs(p.x), Math.abs(p.z))).toBeLessThan(3.5)
    }
  })

  it('rides slower than the traffic', () => {
    const scene = new THREE.Scene()
    const c = createCyclists(scene, grid, flat, () => 0.5)
    c.update(0.016, false)
    const before = cyclistGroups(scene).map(posOf)
    const dt = 1
    c.update(dt, false)
    const after = cyclistGroups(scene).map(posOf)
    // A car floor is ~7 m/s (see traffic.ts); a rider covers well under that in a
    // second — proof the bikes are the slow lane, not just another motorbike.
    for (let i = 0; i < before.length; i++) {
      expect(before[i].distanceTo(after[i])).toBeLessThan(7)
    }
  })

  it('stands them on the terrain, sloped and all', () => {
    const hill = { heightAt: (x: number) => x * 0.2 }
    const scene = new THREE.Scene()
    const c = createCyclists(scene, grid, hill, () => 0.5)
    c.update(0.016, false)
    for (const g of cyclistGroups(scene)) {
      expect(g.position.y).toBeCloseTo(hill.heightAt(g.position.x), 3)
    }
  })

  it('pedals as it rides and freezes when it stands still', () => {
    const scene = new THREE.Scene()
    const c = createCyclists(scene, grid, flat, () => 0.5)
    const crankOf = (): THREE.Group => {
      // The crank pivot is the only child group of a bike body.
      const bike = cyclistGroups(scene)[0]
      return bike.children.find((o) => o instanceof THREE.Group) as THREE.Group
    }
    c.update(0.016, false)
    const spun = crankOf().rotation.z
    for (let f = 0; f < 60; f++) c.update(1 / 60, false)
    expect(crankOf().rotation.z).not.toBeCloseTo(spun, 3) // it turned while riding
    const held = crankOf().rotation.z
    c.update(0, false) // no time, no distance
    expect(crankOf().rotation.z).toBeCloseTo(held, 6) // and holds when stopped
  })

  it('lights the rear lamp at night and darkens it by day', () => {
    const scene = new THREE.Scene()
    const c = createCyclists(scene, grid, flat, () => 0.5)
    const lampOf = (): THREE.MeshStandardMaterial => {
      const bike = cyclistGroups(scene)[0]
      let found: THREE.MeshStandardMaterial | null = null
      bike.traverse((o) => {
        if (o.userData.cyclistLamp) found = (o as THREE.Mesh).material as THREE.MeshStandardMaterial
      })
      return found!
    }
    c.update(0.016, false)
    expect(lampOf().emissiveIntensity).toBe(0)
    c.update(0.016, true)
    expect(lampOf().emissiveIntensity).toBeGreaterThan(0)
  })

  it('lays out the same riders every load, given the same randomness', () => {
    const build = (): THREE.Vector3[] => {
      const scene = new THREE.Scene()
      const c = createCyclists(scene, grid, flat, () => 0.5)
      for (let f = 0; f < 200; f++) c.update(1 / 60, false)
      return cyclistGroups(scene).map(posOf)
    }
    const a = build()
    const b = build()
    expect(a.length).toBe(b.length)
    for (let i = 0; i < a.length; i++) {
      expect(a[i].distanceTo(b[i])).toBeLessThan(1e-6)
    }
  })

  it('collects the graph nodes on cycle-lane roads, and only those', () => {
    const lane: Road = { points: [v(0, 0), v(100, 0), v(200, 0)], kind: 'residential', cycleway: true }
    const plain: Road = { points: [v(0, 60), v(100, 60), v(200, 60)], kind: 'residential' }
    const roads = [lane, plain]
    const graph = buildRoadGraph(roads)
    const cw = cyclewayNodes(roads, graph)
    expect(cw.length).toBeGreaterThan(0)
    // every node returned lies on the lane road (z≈0), never on the plain one (z=60)
    for (const n of cw) expect(Math.abs(graph.nodes[n].z)).toBeLessThan(1)
  })

  it('finds no cycle-lane nodes when no road carries a lane', () => {
    const roads: Road[] = [{ points: [v(0, 0), v(100, 0)], kind: 'residential' }]
    expect(cyclewayNodes(roads, buildRoadGraph(roads))).toEqual([])
  })

  it('starts riders on the cycle lane where the city has one', () => {
    // A lane road (z≈0) and a plain road far off (z=400), unconnected. With the
    // constant rng every rider is biased onto the lane, so none land up at z=400.
    const lane: Road = { points: [v(-300, 0), v(0, 0), v(300, 0)], kind: 'residential', cycleway: true }
    const plain: Road = { points: [v(-300, 400), v(0, 400), v(300, 400)], kind: 'residential' }
    const scene = new THREE.Scene()
    createCyclists(scene, [lane, plain], flat, () => 0.5).update(0.016, false)
    const riders = cyclistGroups(scene).map(posOf)
    expect(riders.length).toBeGreaterThan(0)
    for (const p of riders) expect(Math.abs(p.z)).toBeLessThan(50) // on the lane, not the far road
  })

  it('clears off the scene when the city changes', () => {
    const scene = new THREE.Scene()
    const c = createCyclists(scene, grid, flat, () => 0.5)
    expect(scene.children.length).toBe(1)
    c.dispose()
    expect(scene.children.length).toBe(0)
  })
})
