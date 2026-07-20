import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createPickups } from '../../src/app/pickups'
import type { Vec2 } from '../../src/geo/types'

const flat = { heightAt: () => 0 }

describe('pickups payload', () => {
  it("reports the collected bottle's payload, not merely that one was taken", () => {
    const scene = new THREE.Scene()
    const p = createPickups<string>(scene, () => new THREE.Group(), 1, () => 'boost!')
    p.setSpots([{ x: 60, z: 0 }] as Vec2[], flat, 0, 0)
    const bottle = (scene.children[0] as THREE.Group).children[0]
    expect(bottle.visible, 'the bottle was not placed in the ring').toBe(true)
    expect(p.update(bottle.position.x, bottle.position.z, 0.016)).toBe('boost!')
  })

  it('returns null on a frame where nothing is collected', () => {
    const scene = new THREE.Scene()
    const p = createPickups<string>(scene, () => new THREE.Group(), 1, () => 'boost!')
    p.setSpots([{ x: 200, z: 0 }] as Vec2[], flat, 0, 0)
    expect(p.update(0, 0, 0.016)).toBeNull()
  })

  it('defaults the payload to true, so a boolean caller (petrol cans) still works', () => {
    const scene = new THREE.Scene()
    const p = createPickups(scene, () => new THREE.Group(), 1)
    p.setSpots([{ x: 60, z: 0 }] as Vec2[], flat, 0, 0)
    const bottle = (scene.children[0] as THREE.Group).children[0]
    expect(p.update(bottle.position.x, bottle.position.z, 0.016)).toBe(true)
  })

  it('builds one model per bottle, handing each its index', () => {
    const scene = new THREE.Scene()
    const seen: number[] = []
    createPickups(scene, (i) => {
      seen.push(i)
      return new THREE.Group()
    }, 4)
    expect(seen).toEqual([0, 1, 2, 3])
  })
})
