import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createTraffic } from '../../src/app/traffic'
import { createPedestrians } from '../../src/app/pedestrians'
import type { Road, Vec2 } from '../../src/geo/types'

const v = (x: number, z: number): Vec2 => ({ x, z })
const flat = { heightAt: () => 0 }
const grid: Road[] = [
  { points: [v(-500, 0), v(0, 0), v(500, 0)], kind: 'residential' },
  { points: [v(0, -500), v(0, 0), v(0, 500)], kind: 'residential' },
]
const footpath: Road[] = [{ points: [v(-500, 20), v(500, 20)], kind: 'path' }]

/** Every instance's world position, read back out of the InstancedMesh. */
function positions(mesh: THREE.InstancedMesh): THREE.Vector3[] {
  const out: THREE.Vector3[] = []
  const m = new THREE.Matrix4()
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m)
    out.push(new THREE.Vector3().setFromMatrixPosition(m))
  }
  return out
}

describe('traffic', () => {
  it('puts cars on the road', () => {
    const scene = new THREE.Scene()
    const t = createTraffic(scene, grid, flat, () => 0.5)
    t.update(0.016, 0, 0, 0)
    const bodies = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh
    expect(bodies.count).toBeGreaterThan(1)
  })

  it('drives them along', () => {
    const scene = new THREE.Scene()
    const t = createTraffic(scene, grid, flat, () => 0.5)
    t.update(0.016, 0, 0, 0)
    const bodies = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh
    const before = positions(bodies)
    t.update(2, 0, 0, 0)
    const after = positions(bodies)
    const moved = before.some((p, i) => p.distanceTo(after[i]) > 0.5)
    expect(moved).toBe(true)
  })

  it('keeps them off the centreline, so oncoming cars pass rather than merge', () => {
    const scene = new THREE.Scene()
    const t = createTraffic(scene, grid, flat, () => 0.5)
    t.update(0.016, 0, 0, 0)
    const bodies = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh
    // every car on the east-west road must be offset in z, not sitting on z=0
    for (const p of positions(bodies)) {
      const onEastWest = Math.abs(p.z) < 4 && Math.abs(p.x) > 10
      if (onEastWest) expect(Math.abs(p.z)).toBeGreaterThan(1)
    }
  })

  it('survives a city with no roads at all', () => {
    const scene = new THREE.Scene()
    const t = createTraffic(scene, [], flat, () => 0.5)
    expect(() => t.update(0.016, 0, 0, 0)).not.toThrow()
  })

  it('clears off the scene when the city changes', () => {
    const scene = new THREE.Scene()
    const t = createTraffic(scene, grid, flat, () => 0.5)
    expect(scene.children.length).toBe(1)
    t.dispose()
    expect(scene.children.length).toBe(0)
  })
})

describe('pedestrians', () => {
  it('walks people on a footway, where cars are not allowed', () => {
    // the driving graph drops paths; this is the difference between the two
    const scene = new THREE.Scene()
    const p = createPedestrians(scene, footpath, flat, () => 0.5)
    p.update(0.016, 0, 20)
    const bodies = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh
    expect(bodies.count).toBeGreaterThan(1)
  })

  it('walks, rather than driving', () => {
    const scene = new THREE.Scene()
    const p = createPedestrians(scene, grid, flat, () => 0.5)
    p.update(0.016, 0, 0)
    const bodies = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh
    const before = positions(bodies)
    p.update(1, 0, 0)
    const after = positions(bodies)
    const step = before.map((b, i) => b.distanceTo(after[i])).filter((d) => d < 50)
    expect(Math.max(...step), 'walking pace, in one second').toBeLessThan(3)
  })

  it('keeps them on the pavement, off the carriageway', () => {
    const scene = new THREE.Scene()
    const p = createPedestrians(scene, grid, flat, () => 0.5)
    p.update(0.016, 0, 0)
    const bodies = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh
    for (const pos of positions(bodies)) {
      const onEastWest = Math.abs(pos.z) < 8 && Math.abs(pos.x) > 10
      if (onEastWest) expect(Math.abs(pos.z)).toBeGreaterThan(3)
    }
  })

  it('clears off the scene when the city changes', () => {
    const scene = new THREE.Scene()
    const p = createPedestrians(scene, grid, flat, () => 0.5)
    p.dispose()
    expect(scene.children.length).toBe(0)
  })
})

describe('recycling out of sight', () => {
  /** The scene's fog: nothing is visible past this, so nothing may pop inside it. */
  const FOG_FULL = 900

  const bigGrid: Road[] = []
  for (let i = -6; i <= 6; i++) {
    bigGrid.push({ points: [v(-2000, i * 300), v(2000, i * 300)], kind: 'residential' })
    bigGrid.push({ points: [v(i * 300, -2000), v(i * 300, 2000)], kind: 'residential' })
  }

  it('never spawns a car where you could watch it arrive', () => {
    const scene = new THREE.Scene()
    const t = createTraffic(scene, bigGrid, flat, Math.random)
    const bodies = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh

    // drive a long way, forcing wholesale recycling, and watch for anything
    // materialising within sight of the camera
    let camX = 0
    for (let step = 0; step < 40; step++) {
      camX += 60
      const before = positions(bodies).map((p) => p.clone())
      t.update(0.5, camX, 0, 0)
      const after = positions(bodies)
      after.forEach((p, i) => {
        const jumped = p.distanceTo(before[i]) > 40 // recycled, not driven
        if (!jumped) return
        const d = Math.hypot(p.x - camX, p.z)
        expect(d, 'a car appeared inside the fog').toBeGreaterThan(FOG_FULL * 0.6)
      })
    }
  })

  it('keeps cars around long enough to disappear into the fog, not in plain view', () => {
    const scene = new THREE.Scene()
    const t = createTraffic(scene, bigGrid, flat, Math.random)
    const bodies = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh
    let camX = 0
    for (let step = 0; step < 30; step++) {
      camX += 60
      t.update(0.5, camX, 0, 0)
      const before = positions(bodies).map((p) => p.clone())
      t.update(0.5, camX, 0, 0)
      positions(bodies).forEach((p, i) => {
        if (p.distanceTo(before[i]) <= 40) return
        const wasAt = Math.hypot(before[i].x - camX, before[i].z)
        expect(wasAt, 'a car vanished in plain view').toBeGreaterThan(FOG_FULL * 0.6)
      })
    }
  })
})

describe('dense city, short edges', () => {
  /** A road mapped with vertices ~3m apart, as OSM does through a town. */
  const finelyMapped: Road[] = [
    { points: Array.from({ length: 400 }, (_, i) => v(i * 3, 0)), kind: 'residential' },
  ]

  it('drives smoothly where the vertices are metres apart', () => {
    // The bug: the car advanced when within ARRIVE(4m) of the next node, which
    // on a 3m edge is true on the first frame — so it hopped node to node every
    // frame instead of driving, and jittered.
    const scene = new THREE.Scene()
    const t = createTraffic(scene, finelyMapped, flat, () => 0.5)
    const bodies = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh

    t.update(1 / 60, 0, 0, 0)
    let prev = positions(bodies).map((p) => p.clone())
    for (let f = 0; f < 200; f++) {
      t.update(1 / 60, 0, 0, 0)
      const now = positions(bodies)
      now.forEach((p, i) => {
        const step = p.distanceTo(prev[i])
        // at ~13m/s a frame is ~0.22m; anything near a metre is a teleport
        expect(step, 'a car jumped instead of driving').toBeLessThan(1)
      })
      prev = now.map((p) => p.clone())
    }
  })

  it('walks people smoothly on the same roads', () => {
    const scene = new THREE.Scene()
    const p = createPedestrians(scene, finelyMapped, flat, () => 0.5)
    const bodies = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh
    p.update(1 / 60, 0, 0)
    let prev = positions(bodies).map((q) => q.clone())
    for (let f = 0; f < 200; f++) {
      p.update(1 / 60, 0, 0)
      const now = positions(bodies)
      now.forEach((q, i) => {
        expect(q.distanceTo(prev[i]), 'a pedestrian jumped').toBeLessThan(0.5)
      })
      prev = now.map((q) => q.clone())
    }
  })

  it('still gets somewhere, rather than standing still', () => {
    const scene = new THREE.Scene()
    const t = createTraffic(scene, finelyMapped, flat, () => 0.5)
    const bodies = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh
    t.update(1 / 60, 0, 0, 0)
    const start = positions(bodies).map((p) => p.clone())
    for (let f = 0; f < 600; f++) t.update(1 / 60, 0, 0, 0)
    const moved = positions(bodies).some((p, i) => p.distanceTo(start[i]) > 20)
    expect(moved).toBe(true)
  })

  it('survives a road with a repeated point', () => {
    // duplicate vertices give a zero-length edge; dividing by it hangs the walk
    const dupes: Road[] = [{ points: [v(0, 0), v(10, 0), v(10, 0), v(20, 0)], kind: 'residential' }]
    const scene = new THREE.Scene()
    const t = createTraffic(scene, dupes, flat, () => 0.5)
    expect(() => {
      for (let f = 0; f < 200; f++) t.update(1 / 60, 0, 0, 0)
    }).not.toThrow()
  })
})
