import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createBubbles, BUBBLE_CAP } from '../../src/fx/bubbles'

/** A small deterministic PRNG, so spawn positions don't ride on Math.random. */
function seeded(seed = 1): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

const CAR = { x: 5, y: 0, z: -3 }

/** The pool mesh createBubbles put in the scene. */
function bubbleMesh(scene: THREE.Scene): THREE.InstancedMesh {
  return scene.children.find((c) => (c as THREE.InstancedMesh).isInstancedMesh) as THREE.InstancedMesh
}

/** Heights of every live bubble (a live one has a non-zero scale). */
function liveYs(scene: THREE.Scene): number[] {
  const mesh = bubbleMesh(scene)
  const m = new THREE.Matrix4()
  const pos = new THREE.Vector3()
  const scl = new THREE.Vector3()
  const ys: number[] = []
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m)
    m.decompose(pos, new THREE.Quaternion(), scl)
    if (scl.x > 1e-4) ys.push(pos.y)
  }
  return ys
}

describe('bubbles', () => {
  it('stays empty while the car is not submerged', () => {
    const scene = new THREE.Scene()
    const bubbles = createBubbles(scene, seeded())
    for (let i = 0; i < 60; i++) bubbles.update(1 / 60, false, CAR, 8)
    expect(liveYs(scene).length).toBe(0)
  })

  it('spawns bubbles once the car goes under', () => {
    const scene = new THREE.Scene()
    const bubbles = createBubbles(scene, seeded())
    for (let i = 0; i < 30; i++) bubbles.update(1 / 60, true, CAR, 8)
    expect(liveYs(scene).length).toBeGreaterThan(0)
  })

  it('rises toward the surface over successive updates', () => {
    const scene = new THREE.Scene()
    const bubbles = createBubbles(scene, seeded())
    const surfaceY = 8
    // Prime some bubbles, then watch the highest one climb without passing the top.
    for (let i = 0; i < 20; i++) bubbles.update(1 / 60, true, CAR, surfaceY)
    const early = Math.max(...liveYs(scene))
    for (let i = 0; i < 20; i++) bubbles.update(1 / 60, true, CAR, surfaceY)
    const later = Math.max(...liveYs(scene))
    expect(later).toBeGreaterThan(early)
    for (const y of liveYs(scene)) expect(y).toBeLessThanOrEqual(surfaceY + 1e-4)
  })

  it('never exceeds the pool cap however long it runs', () => {
    const scene = new THREE.Scene()
    const bubbles = createBubbles(scene, seeded())
    // A far-off surface keeps every bubble in the water, so spawning outruns
    // popping — the count can only be held down by the cap.
    for (let i = 0; i < 600; i++) bubbles.update(1 / 60, true, CAR, 1000)
    expect(liveYs(scene).length).toBeLessThanOrEqual(BUBBLE_CAP)
    expect(liveYs(scene).length).toBeGreaterThan(BUBBLE_CAP / 2)
  })

  it('clears out once the car surfaces: the last bubbles rise away', () => {
    const scene = new THREE.Scene()
    const bubbles = createBubbles(scene, seeded())
    const surfaceY = 6
    for (let i = 0; i < 30; i++) bubbles.update(1 / 60, true, CAR, surfaceY)
    expect(liveYs(scene).length).toBeGreaterThan(0)
    // Out of the water now: no new bubbles, and the live ones finish their climb.
    for (let i = 0; i < 600; i++) bubbles.update(1 / 60, false, CAR, surfaceY)
    expect(liveYs(scene).length).toBe(0)
  })

  it('dispose removes the pool from the scene', () => {
    const scene = new THREE.Scene()
    const bubbles = createBubbles(scene, seeded())
    bubbles.update(1 / 60, true, CAR, 8)
    expect(bubbleMesh(scene)).toBeTruthy()
    bubbles.dispose()
    expect(scene.children.length).toBe(0)
  })
})
