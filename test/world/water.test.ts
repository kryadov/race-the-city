import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { waterLevel, buildWater } from '../../src/world/water'
import type { Vec2 } from '../../src/geo/types'

const v = (x: number, z: number): Vec2 => ({ x, z }) as Vec2

/** The one railing mesh in a water group, found by its metal-grey material. */
const railingMesh = (obj: THREE.Object3D): THREE.Mesh | undefined => {
  let found: THREE.Mesh | undefined
  obj.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
    if ((o as THREE.Mesh).isMesh && mat && !Array.isArray(mat) && mat.color?.getHex() === 0x77797d) {
      found = o as THREE.Mesh
    }
  })
  return found
}

describe('waterLevel', () => {
  it('sits just above the lowest ground under the outline', () => {
    const ring = [v(0, 0), v(10, 0), v(10, 10), v(0, 10)]
    const provider = { heightAt: (x: number) => (x === 0 ? 5 : 9) }
    expect(waterLevel(ring, provider)).toBeCloseTo(5.2)
  })

  it('does not hang in the air when the centroid lands on a bank', () => {
    // A crescent river: the centroid (~15,15) is dry land 40m up, while the
    // water itself runs along the low outline. Levelling by centroid floated
    // the whole surface over the valley.
    const ring = [v(0, 0), v(30, 0), v(30, 30), v(20, 30), v(20, 10), v(0, 10)]
    const provider = {
      heightAt: (x: number, z: number) => (x > 14 && x < 21 && z > 12 && z < 25 ? 40 : 2),
    }
    const level = waterLevel(ring, provider)
    expect(level).toBeCloseTo(2.2)
    expect(level).toBeLessThan(40)
  })

  it('follows the basin down as the terrain drops', () => {
    const ring = [v(0, 0), v(10, 0), v(10, 10)]
    const high = { heightAt: () => 100 }
    const low = { heightAt: () => -3 }
    expect(waterLevel(ring, high)).toBeCloseTo(100.2)
    expect(waterLevel(ring, low)).toBeCloseTo(-2.8)
  })
})

describe('buildWater railing', () => {
  const flat = { heightAt: () => 0 }

  it('rails a sizable body with a single merged mesh', () => {
    const ring = [v(0, 0), v(100, 0), v(100, 100), v(0, 100)] // 400m perimeter
    const rail = railingMesh(buildWater([ring], flat))
    expect(rail).toBeDefined()
    const pos = rail!.geometry.getAttribute('position')
    // Posts + top rail, distance-spaced round the loop: many bars, all in one mesh.
    expect(pos.count).toBeGreaterThan(0)
    // ...and seated on the dry lip, so every vertex stands at or above it.
    for (let i = 0; i < pos.count; i++) expect(pos.getY(i)).toBeGreaterThanOrEqual(0.5 - 1e-6)
  })

  it('leaves a tiny pond unrailed', () => {
    const pond = [v(0, 0), v(6, 0), v(6, 6), v(0, 6)] // 24m perimeter, under the minimum
    expect(railingMesh(buildWater([pond], flat))).toBeUndefined()
  })
})
