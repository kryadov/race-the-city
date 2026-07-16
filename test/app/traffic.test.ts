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
