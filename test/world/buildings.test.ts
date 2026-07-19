import { describe, it, expect, beforeAll } from 'vitest'
import * as THREE from 'three'
import { buildBuildings, groundStats } from '../../src/world/buildings'
import type { Building, Vec2 } from '../../src/geo/types'

// buildBuildings draws its facades on a canvas node hasn't got; a tiny stub is
// cheaper than jsdom, and the drawing itself isn't what these tests check.
beforeAll(() => {
  const ctx2d = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    fillRect: () => undefined,
    strokeRect: () => undefined,
  }
  ;(globalThis as unknown as { document: unknown }).document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }),
  }
})

const flat = { heightAt: () => 0 }
const v = (x: number, z: number): Vec2 => ({ x, z })

/** A plain rectangular building of a given class, big enough for a front. */
const box = (kind: Building['kind']): Building => ({
  footprint: [v(0, 0), v(12, 0), v(12, 8), v(0, 8)],
  height: 9,
  kind,
})

/** The city's one shopfront draw, if it has one. */
const shopfront = (root: THREE.Object3D): THREE.InstancedMesh | undefined => {
  let sf: THREE.InstancedMesh | undefined
  root.traverse((c) => {
    if (c.name === 'shopfronts') sf = c as THREE.InstancedMesh
  })
  return sf
}

describe('groundStats', () => {
  it('computes the lowest and highest ground under a footprint', () => {
    const ramp = { heightAt: (x: number) => x } // height rises with x
    const ring: Vec2[] = [
      { x: 0, z: 0 },
      { x: 10, z: 0 },
      { x: 10, z: 10 },
      { x: 0, z: 10 },
    ]
    const s = groundStats(ring, ramp)
    expect(s.min).toBe(0) // lowest corner (x=0)
    expect(s.max).toBe(10) // highest corner (x=10)
  })
})

describe('shopfronts', () => {
  it('glazes a shop with its own instanced band and material', () => {
    const { mesh, facades } = buildBuildings([box('retail')], flat)
    const sf = shopfront(mesh)
    expect(sf, 'a retail building should get a shopfront mesh').toBeDefined()
    expect(sf!.isInstancedMesh).toBe(true)
    expect(sf!.count).toBeGreaterThan(0) // a glazed pane per bay round the ground floor
    // A distinct, glassier material — not the shop's repeating wall facade.
    expect(sf!.material).not.toBe(facades.of('retail'))
  })

  it('glazes civic buildings too, as fellow services', () => {
    expect(shopfront(buildBuildings([box('civic')], flat).mesh)).toBeDefined()
  })

  it('leaves houses with a plain ground floor', () => {
    const { mesh } = buildBuildings([box('house')], flat)
    expect(shopfront(mesh), 'a house should get no shopfront').toBeUndefined()
  })
})
