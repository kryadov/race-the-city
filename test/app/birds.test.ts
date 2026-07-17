import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createBirds } from '../../src/app/birds'

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

function quatAt(mesh: THREE.InstancedMesh, i: number): THREE.Quaternion {
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  mesh.getMatrixAt(i, m)
  m.decompose(new THREE.Vector3(), q, new THREE.Vector3())
  return q
}

describe('birds', () => {
  it('flies a flock, not a mesh per bird', () => {
    const scene = new THREE.Scene()
    createBirds(scene, () => 0.5, 6)
    const group = scene.children[0] as THREE.Group
    // one instanced draw per wing side, however many birds there are
    expect(group.children.length).toBe(2)
    const wing = group.children[0] as THREE.InstancedMesh
    expect(wing.count).toBe(6)
  })

  it('stays near the camera as it drives across the map', () => {
    const scene = new THREE.Scene()
    const b = createBirds(scene, () => 0.5, 6)
    const wing = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh
    let camX = 0
    for (let step = 0; step < 200; step++) {
      camX += 20
      b.update(0.1, camX, 0)
    }
    for (const p of positions(wing)) {
      expect(Math.hypot(p.x - camX, p.z)).toBeLessThan(200)
    }
  })

  it('is already there on the first frame, not flying in from the map origin', () => {
    const scene = new THREE.Scene()
    const b = createBirds(scene, () => 0.5, 6)
    const wing = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh
    b.update(0.016, 4000, -4000)
    for (const p of positions(wing)) {
      expect(Math.hypot(p.x - 4000, p.z + 4000)).toBeLessThan(200)
    }
  })

  it('follows a jump in the camera position too, not just a steady drive', () => {
    // a city change teleports the camera; the flock must not be left behind
    // wherever the old city was
    const scene = new THREE.Scene()
    const b = createBirds(scene, () => 0.5, 6)
    const wing = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh
    for (let i = 0; i < 50; i++) b.update(0.1, 0, 0)
    b.update(0.1, 9000, 9000)
    for (const p of positions(wing)) {
      expect(Math.hypot(p.x - 9000, p.z - 9000)).toBeLessThan(200)
    }
  })

  it('keeps them well above the car and well below the lowest aircraft', () => {
    const scene = new THREE.Scene()
    const b = createBirds(scene, () => 0.3, 6)
    const wing = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh
    for (let i = 0; i < 300; i++) {
      b.update(0.1, 0, 0)
      for (const p of positions(wing)) {
        expect(p.y).toBeGreaterThan(15) // above a car and any rooftop
        expect(p.y).toBeLessThan(70) // under the helicopter, the lowest aircraft
      }
    }
  })

  it('wheels as a flock — birds stay clustered, not scattered across the map', () => {
    const scene = new THREE.Scene()
    const b = createBirds(scene, () => 0.5, 8)
    const wing = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh
    for (let i = 0; i < 50; i++) b.update(0.1, 100, 50)
    const pts = positions(wing)
    let maxD = 0
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) maxD = Math.max(maxD, pts[i].distanceTo(pts[j]))
    expect(maxD, 'a flock this spread out reads as loners, not a flock').toBeLessThan(70)
  })

  it('flaps — a wing changes angle over time, and both wings move', () => {
    const scene = new THREE.Scene()
    const b = createBirds(scene, () => 0.5, 4)
    const group = scene.children[0] as THREE.Group
    const right = group.children[0] as THREE.InstancedMesh
    const left = group.children[1] as THREE.InstancedMesh

    b.update(0.016, 0, 0)
    const before = quatAt(right, 0)
    for (let i = 0; i < 60; i++) b.update(0.05, 0, 0)
    const after = quatAt(right, 0)
    expect(after.angleTo(before), 'the wing never moved').toBeGreaterThan(0.01)

    // a real wingbeat is symmetric — both wings should differ, not one alone
    const leftAfter = quatAt(left, 0)
    expect(leftAfter.angleTo(after), 'only one wing flapped').toBeGreaterThan(0.01)
  })

  it('goes away when switched off', () => {
    const scene = new THREE.Scene()
    const b = createBirds(scene, () => 0.5, 4)
    b.update(0.1, 0, 0)
    b.setEnabled(false)
    expect((scene.children[0] as THREE.Group).visible).toBe(false)
    b.setEnabled(true)
    expect((scene.children[0] as THREE.Group).visible).toBe(true)
  })

  it('takes itself off the scene when the city changes', () => {
    const scene = new THREE.Scene()
    const b = createBirds(scene, () => 0.5, 4)
    expect(scene.children.length).toBe(1)
    b.dispose()
    expect(scene.children.length, 'birds from the old city must not pile up').toBe(0)
  })

  it('is deterministic given the same rand function', () => {
    const s1 = new THREE.Scene()
    const s2 = new THREE.Scene()
    const b1 = createBirds(s1, () => 0.42, 5)
    const b2 = createBirds(s2, () => 0.42, 5)
    for (let i = 0; i < 40; i++) {
      b1.update(0.1, 30, -10)
      b2.update(0.1, 30, -10)
    }
    const w1 = (s1.children[0] as THREE.Group).children[0] as THREE.InstancedMesh
    const w2 = (s2.children[0] as THREE.Group).children[0] as THREE.InstancedMesh
    const flat = (arr: THREE.Vector3[]): number[][] => arr.map((p) => [p.x, p.y, p.z])
    expect(flat(positions(w1))).toEqual(flat(positions(w2)))
  })

  it('survives a flock of one', () => {
    const scene = new THREE.Scene()
    const b = createBirds(scene, () => 0.5, 1)
    expect(() => {
      for (let i = 0; i < 100; i++) b.update(0.1, 0, 0)
    }).not.toThrow()
  })
})
