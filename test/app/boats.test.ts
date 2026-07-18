import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { spots, createBoats } from '../../src/app/boats'
import type { Vec2 } from '../../src/geo/types'

/** Ground a metre below the waterline everywhere, so the whole outline is wet. */
const wet = { heightAt: () => -1 }

/** A square pond `size` metres across, centred at (cx, cz). */
function pond(size: number, cx = 0, cz = 0): Vec2[] {
  const h = size / 2
  return [
    { x: cx - h, z: cz - h },
    { x: cx + h, z: cz - h },
    { x: cx + h, z: cz + h },
    { x: cx - h, z: cz + h },
  ]
}

describe('boats on small water', () => {
  it('finds a spot on a pond too small and too off-grid for the coarse sweep', () => {
    // ~24m across, centred at (20,20): no multiple-of-40 grid node lands inside
    // it, so the coarse sweep comes back empty — the small-pond rescue must still
    // yield a spot, genuinely inside the pond.
    const found = spots(pond(24, 20, 20), wet, 0)
    expect(found.length).toBeGreaterThan(0)
    for (const s of found) {
      expect(Math.abs(s.x - 20)).toBeLessThan(12)
      expect(Math.abs(s.z - 20)).toBeLessThan(12)
    }
  })

  it('floats at least one boat on that small pond', () => {
    const scene = new THREE.Scene()
    const boats = createBoats(scene, [pond(24, 20, 20)], wet, () => 0.5, 6)
    const group = scene.children[0] as THREE.Group
    expect(group.children.length).toBeGreaterThan(0) // a hull got placed
    boats.dispose()
  })

  it('still leaves a genuine puddle empty', () => {
    // 6m across (radius 3, below MIN_ROOM): too small for even a rowboat.
    expect(spots(pond(6, 20, 20), wet, 0).length).toBe(0)
  })
})
