import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createNitro, NEAR_MIN, NEAR_MAX, FAR, APART } from '../../src/app/nitro'
import type { Vec2 } from '../../src/geo/types'

const flat = { heightAt: () => 0 }

/** Road vertices spread over a ~1000m-radius city, like a real OSM network. */
function citySpots(): Vec2[] {
  const spots: Vec2[] = []
  for (let i = 0; i < 4000; i++) {
    const a = (i / 4000) * Math.PI * 2 * 7
    const r = 20 + (i % 980)
    spots.push({ x: Math.cos(a) * r, z: Math.sin(a) * r } as Vec2)
  }
  return spots
}

function bottles(scene: THREE.Scene): THREE.Object3D[] {
  return (scene.children[0] as THREE.Group).children
}

const distTo = (o: THREE.Object3D, x: number, z: number): number =>
  Math.hypot(o.position.x - x, o.position.z - z)

describe('nitro', () => {
  it('scatters every bottle in the ring around the car, not across the whole city', () => {
    const scene = new THREE.Scene()
    const nitro = createNitro(scene)
    nitro.setSpots(citySpots(), flat, 300, -200)

    const active = bottles(scene).filter((b) => b.visible)
    expect(active.length).toBeGreaterThan(0)
    for (const b of active) {
      const d = distTo(b, 300, -200)
      expect(d).toBeGreaterThanOrEqual(NEAR_MIN - 1)
      expect(d).toBeLessThanOrEqual(NEAR_MAX + 1)
    }
  })

  it('respawns a collected bottle near the car rather than anywhere in the city', () => {
    const scene = new THREE.Scene()
    const nitro = createNitro(scene)
    nitro.setSpots(citySpots(), flat, 0, 0)

    // drive onto the nearest bottle to collect it
    const target = bottles(scene).find((b) => b.visible)!
    expect(nitro.update(target.position.x, target.position.z, 0.016)).toBe(true)
    expect(target.visible).toBe(false)

    // wait out the respawn timer while the car sits at a new spot
    for (let i = 0; i < 800; i++) nitro.update(500, 500, 0.016)
    expect(target.visible).toBe(true)
    expect(distTo(target, 500, 500)).toBeLessThanOrEqual(NEAR_MAX + 1)
  })

  it('recycles bottles left far behind so the field follows the car', () => {
    const scene = new THREE.Scene()
    const nitro = createNitro(scene)
    nitro.setSpots(citySpots(), flat, 0, 0)

    // drive far away from where the bottles were placed
    nitro.update(-800, 600, 0.016)
    for (const b of bottles(scene).filter((o) => o.visible)) {
      expect(distTo(b, -800, 600)).toBeLessThanOrEqual(FAR)
    }
  })

  it('falls back to any spot when the ring around the car is empty', () => {
    const scene = new THREE.Scene()
    const nitro = createNitro(scene)
    // a single cluster of spots, with the car nowhere near it
    const spots: Vec2[] = [{ x: 0, z: 0 } as Vec2, { x: 5, z: 5 } as Vec2]
    nitro.setSpots(spots, flat, 5000, 5000)
    expect(bottles(scene).filter((b) => b.visible).length).toBeGreaterThan(0)
  })

  it('hides everything when there are no spots at all', () => {
    const scene = new THREE.Scene()
    const nitro = createNitro(scene)
    nitro.setSpots([], flat, 0, 0)
    expect(bottles(scene).filter((b) => b.visible).length).toBe(0)
  })
})

describe('bottles keep their distance', () => {
  it('does not drop two of them on top of each other', () => {
    // Four bottles filled one view, two of them touching: a spot was drawn from
    // the road's vertices with nothing said about where the others had gone.
    const scene = new THREE.Scene()
    const n = createNitro(scene)
    n.setSpots(citySpots(), flat, 0, 0)
    const out = (scene.children[0] as THREE.Group).children.filter((c) => c.visible)
    let closest = Infinity
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        closest = Math.min(closest, out[i].position.distanceTo(out[j].position))
      }
    }
    expect(out.length, 'nothing was placed at all').toBeGreaterThan(1)
    expect(closest, 'two bottles are standing in the same spot').toBeGreaterThanOrEqual(APART - 0.01)
  })

  it('keeps them apart even where it cannot keep them far apart', () => {
    // A cramped network: nowhere is APART clear, but nothing may share a spot.
    const cramped: Vec2[] = Array.from({ length: 60 }, (_, i) => ({ x: 60 + i * 3, z: 0 }))
    const scene = new THREE.Scene()
    const n = createNitro(scene)
    n.setSpots(cramped, flat, 0, 0)
    const out = (scene.children[0] as THREE.Group).children.filter((c) => c.visible)
    let closest = Infinity
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        closest = Math.min(closest, out[i].position.distanceTo(out[j].position))
      }
    }
    expect(closest, 'two bottles ended up in the same place').toBeGreaterThan(0)
  })

  it('still places them when the roads are too small to keep them apart', () => {
    // A stub with nowhere far enough to go: a bottle you can reach beats a gap.
    const scene = new THREE.Scene()
    const n = createNitro(scene)
    n.setSpots([{ x: 60, z: 0 }, { x: 65, z: 0 }], flat, 0, 0)
    const out = (scene.children[0] as THREE.Group).children.filter((c) => c.visible)
    expect(out.length).toBeGreaterThan(0)
  })
})
