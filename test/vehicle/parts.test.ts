import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { lens, housingBar, box, REAR_LIGHT_MAT } from '../../src/vehicle/models/parts'

const extent = (o: THREE.Mesh): THREE.Vector3 => {
  const b = new THREE.Box3().setFromObject(o)
  return b.getSize(new THREE.Vector3())
}

/**
 * Models face +x, so a light's width runs along z and its height along y.
 * lens() and housingBar() used to take those two in opposite orders, which put
 * two 1.5m-tall planks through the back of the EV and the hovercar in v0.58.0 —
 * with the whole suite green, because nothing asserted the shape.
 */
describe('light primitives', () => {
  it('reads lens(w, h) as width across, height up', () => {
    const e = extent(lens(REAR_LIGHT_MAT, 1.5, 0.3, -2, 0.8, 0, -1))
    expect(e.z, 'w must be the width, across the tail').toBeCloseTo(1.5, 2)
    expect(e.y, 'h must be the height').toBeCloseTo(0.3, 2)
  })

  it('reads housingBar(w, h) the same way round', () => {
    const e = extent(housingBar(1.9, 0.4, -2, 0.8, 0, -1))
    expect(e.z, 'w must be the width').toBeCloseTo(1.9, 2)
    expect(e.y, 'h must be the height').toBeCloseTo(0.4, 2)
  })

  it('agrees with box(), which is the one everything else is measured against', () => {
    // box(w, h, d): w along x, h up, d along z
    const e = extent(box(2, 0.5, 1.2, 0xffffff, 0, 0, 0))
    expect(e.x).toBeCloseTo(2, 2)
    expect(e.y).toBeCloseTo(0.5, 2)
    expect(e.z).toBeCloseTo(1.2, 2)
  })

  it('stands a lens proud of the body it sits on', () => {
    // a lens flush with the panel z-fights it
    const rear = lens(REAR_LIGHT_MAT, 1, 0.3, -2, 0.8, 0, -1)
    expect(rear.position.x).toBeLessThan(-2) // proud, i.e. further back than the surface
    const front = lens(REAR_LIGHT_MAT, 1, 0.3, 2, 0.8, 0, 1)
    expect(front.position.x).toBeGreaterThan(2) // and further forward at the nose
  })
})
