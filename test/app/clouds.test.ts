import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createClouds } from '../../src/app/clouds'

const meshOf = (scene: THREE.Scene): THREE.InstancedMesh =>
  (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh

describe('cloud cover', () => {
  it('draws more cloud when it rains', () => {
    // rain out of a blue sky is the thing that gives weather away
    const scene = new THREE.Scene()
    const c = createClouds(scene)
    c.setCover(0)
    const clear = meshOf(scene).count
    c.setCover(1)
    expect(meshOf(scene).count).toBeGreaterThan(clear)
  })

  it('costs no extra draw call for them', () => {
    // every cloud an overcast sky wants is built up front; count does the rest
    const scene = new THREE.Scene()
    const c = createClouds(scene)
    const draws = () => (scene.children[0] as THREE.Group).children.length
    c.setCover(0)
    const before = draws()
    c.setCover(1)
    expect(draws()).toBe(before)
  })

  it('never draws more than it built', () => {
    const scene = new THREE.Scene()
    const c = createClouds(scene)
    c.setCover(1)
    const im = meshOf(scene)
    expect(im.count).toBeLessThanOrEqual(im.instanceMatrix.count)
  })

  it('greys them off as the cover comes in', () => {
    const scene = new THREE.Scene()
    const c = createClouds(scene)
    c.setCover(0)
    const bright = (meshOf(scene).material as THREE.MeshStandardMaterial).color.r
    c.setCover(1)
    const dull = (meshOf(scene).material as THREE.MeshStandardMaterial).color.r
    expect(dull, 'white fluff over a downpour').toBeLessThan(bright)
  })

  it('takes any number without breaking', () => {
    const scene = new THREE.Scene()
    const c = createClouds(scene)
    for (const v of [-5, 0, 0.5, 1, 99]) {
      c.setCover(v)
      const im = meshOf(scene)
      expect(im.count).toBeGreaterThan(0)
      expect(im.count).toBeLessThanOrEqual(im.instanceMatrix.count)
    }
  })
})
