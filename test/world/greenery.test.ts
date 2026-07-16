import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { variantsFor, frondGeo } from '../../src/world/greenery'

const names = (lat: number): string[] => variantsFor(lat).map((v) => v.name)
const hasPalm = (lat: number): boolean => names(lat).includes('palm')

describe('variantsFor', () => {
  it('grows palms in the tropics and subtropics', () => {
    for (const lat of [0, 12.9, 25.2, 35.7]) expect(hasPalm(lat), `${lat}`).toBe(true)
  })

  it('grows no palms up north', () => {
    for (const lat of [55.75, 59.94, 64.1]) expect(hasPalm(lat), `${lat}`).toBe(false)
  })

  it('mixes them on the Mediterranean', () => {
    // Monaco, 43.7N — the city that prompted this: conifers there read as wrong,
    // but so would nothing but palms.
    const monaco = names(43.73)
    expect(monaco).toContain('palm')
    expect(monaco.some((n) => n !== 'palm')).toBe(true)
  })

  it('treats the southern hemisphere the same', () => {
    expect(hasPalm(-23.5)).toBe(true) // Rio
    expect(hasPalm(-54.8)).toBe(false) // Ushuaia
  })

  it('always offers something to plant', () => {
    for (let lat = -90; lat <= 90; lat += 3) expect(variantsFor(lat).length).toBeGreaterThan(0)
  })

  it('gives palms their own tall trunk, and leaves the others sharing one', () => {
    const palm = variantsFor(10).find((v) => v.name === 'palm')!
    expect(palm.trunk, 'a palm on a stubby 2m trunk is a shrub').toBeDefined()
    const conifer = variantsFor(60).find((v) => v.name === 'conifer')!
    expect(conifer.trunk).toBeUndefined()
  })
})

describe('a palm crown', () => {
  /** Every point of the crown, in polar terms, ignoring the solid middle. */
  function spokes(g: THREE.BufferGeometry, radius: number): number[] {
    const pos = g.getAttribute('position')
    const out: number[] = []
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      if (Math.hypot(x, z) < radius * 0.5) continue // near the trunk everything is solid
      out.push(Math.atan2(z, x))
    }
    return out
  }

  /** How far the crown strays from the nearest of `n` evenly spaced fronds, in radians. */
  function offSpoke(g: THREE.BufferGeometry, radius: number, n: number): number {
    const step = (Math.PI * 2) / n
    let worst = 0
    for (const a of spokes(g, radius)) {
      const off = Math.abs(a - Math.round(a / step) * step)
      worst = Math.max(worst, off)
    }
    return worst
  }

  it('is separate fronds with sky between them, not a ball', () => {
    // It was an icosahedron squashed to a third of its height: a round tree that
    // had been sat on, and it read as an ordinary tree in Cairo. The test that
    // matters is that the crown lies along its leaves and nowhere else — sky in
    // between is exactly what a ball has not got.
    // Subdivided, so the control has vertices in every direction rather than the
    // twelve an icosahedron happens to have — the shape is what is on trial here.
    const ball = new THREE.IcosahedronGeometry(2.3, 2)
    ball.scale(1, 0.34, 1)
    expect(offSpoke(frondGeo(2.3), 2.3, 8)).toBeLessThan(0.25)
    expect(offSpoke(ball, 2.3, 8), 'a ball fills every direction').toBeGreaterThan(0.25)
  })

  it('reaches out as far as it is asked to', () => {
    const g = frondGeo(2.3)
    g.computeBoundingBox()
    const box = g.boundingBox!
    expect(Math.max(box.max.x, box.max.z)).toBeGreaterThan(2.3 * 0.7)
  })

  it('droops: the frond tips hang below where they spring from', () => {
    const g = frondGeo(2.3)
    g.computeBoundingBox()
    expect(g.boundingBox!.min.y).toBeLessThan(-0.2)
  })
})
