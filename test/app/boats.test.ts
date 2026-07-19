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

/** The one rowboat placed on a pond too small for anything larger. */
function placeRowboat(): { scene: THREE.Scene; boat: THREE.Group; boats: ReturnType<typeof createBoats> } {
  const scene = new THREE.Scene()
  const boats = createBoats(scene, [pond(24, 20, 20)], wet, () => 0.5, 6)
  const container = scene.children[0] as THREE.Group
  const boat = container.children.find(
    (c) => (c as THREE.Object3D).userData.boatKind === 'rowboat',
  ) as THREE.Group
  return { scene, boat, boats }
}

describe('the rowboat', () => {
  it('has a tapered hull that comes to a point at bow and stern', () => {
    const { boat, boats } = placeRowboat()
    expect(boat).toBeDefined()
    const hull = boat.userData.hull as THREE.Mesh
    const geo = hull.geometry as THREE.BufferGeometry
    // Not the old block: a real box hull is uniform-beam end to end.
    expect(geo).not.toBeInstanceOf(THREE.BoxGeometry)

    const pos = geo.getAttribute('position')
    let minX = Infinity
    let maxX = -Infinity
    let beam = 0
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      beam = Math.max(beam, Math.abs(pos.getZ(i)))
    }
    // A genuine beam amidships...
    expect(beam).toBeGreaterThan(0.3)
    // ...that pinches to a point at each end (a double-ender).
    let bowBeam = 0
    let sternBeam = 0
    for (let i = 0; i < pos.count; i++) {
      const az = Math.abs(pos.getZ(i))
      if (Math.abs(pos.getX(i) - maxX) < 0.05) bowBeam = Math.max(bowBeam, az)
      if (Math.abs(pos.getX(i) - minX) < 0.05) sternBeam = Math.max(sternBeam, az)
    }
    expect(bowBeam).toBeLessThan(0.05)
    expect(sternBeam).toBeLessThan(0.05)
    boats.dispose()
  })

  it('has a rower and two oars that sweep with the passing of time', () => {
    const { boat, boats } = placeRowboat()
    const oars = boat.userData.oars as THREE.Group[]
    expect(oars.length).toBe(2)
    expect(boat.userData.rower).toBeDefined()

    // The stroke is a pure function of accumulated time, so the same boat at two
    // different moments strikes different oar angles — no wiring, no per-frame
    // state beyond the shared clock the update already keeps.
    boats.update(0.1)
    const before = oars[0].rotation.y
    boats.update(0.4)
    const after = oars[0].rotation.y
    expect(after).not.toBe(before)
    boats.dispose()
  })
})
