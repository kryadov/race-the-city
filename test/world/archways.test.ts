import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  segmentThroughPolygon,
  corridorFor,
  perpDistance,
  subtractCorridors,
  polygonArea,
  buildArchways,
  MARGIN,
  type DrivableWay,
} from '../../src/world/archways'
import { pointInPolygon } from '../../src/physics/collide'
import type { Vec2 } from '../../src/geo/types'

const v = (x: number, z: number): Vec2 => ({ x, z })
/** A 20×20 box centred on the origin. */
const box: Vec2[] = [v(-10, -10), v(10, -10), v(10, 10), v(-10, 10)]
const flat = { heightAt: () => 0 }

/** Is (x,z) inside ANY of the polygons? */
const inAny = (x: number, z: number, polys: Vec2[][]): boolean =>
  polys.some((p) => pointInPolygon(x, z, p))

describe('segmentThroughPolygon', () => {
  it('finds a segment that crosses the interior', () => {
    expect(segmentThroughPolygon(v(-20, 0), v(20, 0), box)).toBe(true)
  })

  it('finds one that starts inside', () => {
    expect(segmentThroughPolygon(v(0, 0), v(50, 0), box)).toBe(true)
  })

  it('ignores a segment that misses entirely', () => {
    expect(segmentThroughPolygon(v(-20, 50), v(20, 50), box)).toBe(false)
  })

  it('ignores a near-miss parallel to an edge', () => {
    expect(segmentThroughPolygon(v(-20, 10.5), v(20, 10.5), box)).toBe(false)
  })

  it('ignores a segment that only grazes a corner from outside', () => {
    // Passes through the (10,10) corner without ever entering the interior.
    expect(segmentThroughPolygon(v(11, 9), v(9, 11), box)).toBe(false)
  })
})

describe('corridorFor / perpDistance', () => {
  const cor = corridorFor(v(-10, 0), v(10, 0), 3) // physical half 3

  it('widens the band to the road half-width plus the margin', () => {
    expect(cor.half).toBeCloseTo(3 + MARGIN)
  })

  it('runs along the road, centred on it', () => {
    expect(cor.dx).toBeCloseTo(1)
    expect(cor.dz).toBeCloseTo(0)
    expect(perpDistance(cor, v(0, 0))).toBeCloseTo(0)
  })

  it('measures perpendicular offset, so the band spans the full road width', () => {
    // A point at the very edge of the physical road (perp 3) is inside the band;
    // one well past the margin (perp 6) is outside it.
    expect(Math.abs(perpDistance(cor, v(0, 3)))).toBeLessThan(cor.half)
    expect(Math.abs(perpDistance(cor, v(0, 6)))).toBeGreaterThan(cor.half)
  })
})

describe('subtractCorridors', () => {
  const cor = corridorFor(v(-10, 0), v(10, 0), 3) // half 4, runs along x through the box
  const remainders = subtractCorridors(box, [cor])

  it('leaves solid ground on BOTH sides of the road', () => {
    expect(remainders.length).toBe(2)
    expect(inAny(0, 8, remainders), 'north of the road').toBe(true)
    expect(inAny(0, -8, remainders), 'south of the road').toBe(true)
  })

  it('leaves NOTHING across the corridor — the road is open all the way through', () => {
    for (const x of [-8, -4, 0, 4, 8]) {
      expect(inAny(x, 0, remainders), `on the road at x=${x}`).toBe(false)
    }
  })

  it('keeps a point that is in the building but off the road solid', () => {
    expect(inAny(-7, 7, remainders)).toBe(true)
    expect(inAny(7, -7, remainders)).toBe(true)
  })

  it('opens all of several corridors crossing one building', () => {
    const across = corridorFor(v(0, -10), v(0, 10), 3) // a second road, along z
    const pieces = subtractCorridors(box, [cor, across])
    expect(inAny(0, 0, pieces), 'the crossroads is open').toBe(false)
    expect(inAny(0, 8, pieces), 'on the z-road').toBe(false)
    expect(inAny(8, 0, pieces), 'on the x-road').toBe(false)
    expect(inAny(7, 7, pieces), 'a corner of the block is still solid').toBe(true)
  })
})

describe('subtractCorridors on a concave (L-shaped) footprint', () => {
  // An L: the full bottom strip x∈[0,20] z∈[0,10], plus a right arm x∈[10,20] z∈[10,20].
  const el: Vec2[] = [v(0, 0), v(20, 0), v(20, 20), v(10, 20), v(10, 10), v(0, 10)]
  const cor = corridorFor(v(0, 5), v(20, 5), 3) // road along the bottom strip, half 4

  it('opens the road while keeping the far arm solid', () => {
    const pieces = subtractCorridors(el, [cor])
    expect(inAny(5, 5, pieces), 'on the road').toBe(false)
    expect(inAny(15, 15, pieces), 'in the far arm, off the road').toBe(true)
    expect(inAny(5, 0.5, pieces), 'the strip south of the road').toBe(true)
  })
})

describe('polygonArea', () => {
  it('measures the box regardless of winding', () => {
    expect(polygonArea(box)).toBeCloseTo(400)
    expect(polygonArea([...box].reverse())).toBeCloseTo(400)
  })
})

describe('buildArchways', () => {
  it('carves the crossed building and leaves an uncrossed one whole', () => {
    const far: Vec2[] = [v(200, 200), v(220, 200), v(220, 220), v(200, 220)]
    const ways: DrivableWay[] = [{ points: [v(-30, 0), v(30, 0)], half: 3 }]
    const arch = buildArchways([box, far], [10, 10], ways, flat)
    expect(arch.openedCount).toBe(1)
    expect(arch.unhandledCount).toBe(0)
    // The road is open in the collision set...
    expect(inAny(0, 0, arch.footprints), 'the passage').toBe(false)
    expect(inAny(0, 8, arch.footprints), 'the block beside it').toBe(true)
    // ...and the far building is passed through untouched.
    expect(arch.footprints.some((f) => pointInPolygon(210, 210, f))).toBe(true)
  })

  it('stands a stone frame over the passage', () => {
    const ways: DrivableWay[] = [{ points: [v(-30, 0), v(30, 0)], half: 3 }]
    const arch = buildArchways([box], [10], ways, flat)
    const mesh = arch.object as THREE.Mesh
    expect(mesh.geometry).toBeDefined()
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    expect(pos.count).toBeGreaterThan(0)
    // The frame reaches head height (well above the ground the corridor sits on).
    const bbox = new THREE.Box3().setFromObject(arch.object)
    expect(bbox.max.y).toBeGreaterThan(2.5)
  })

  it('keeps a building SOLID rather than open a hole through the whole of it', () => {
    // A tiny 2×2 block sits entirely inside the road band, so subtraction empties
    // it. It must stay solid (road blocked) — never a full-building grid hole.
    const tiny: Vec2[] = [v(-1, -1), v(1, -1), v(1, 1), v(-1, 1)]
    const ways: DrivableWay[] = [{ points: [v(-10, 0), v(10, 0)], half: 3 }]
    const arch = buildArchways([tiny], [6], ways, flat)
    expect(arch.openedCount).toBe(0)
    expect(arch.unhandledCount).toBe(1)
    expect(inAny(0, 0, arch.footprints), 'the tiny block stays solid').toBe(true)
  })

  it('does nothing when no way crosses a building', () => {
    const ways: DrivableWay[] = [{ points: [v(-30, 50), v(30, 50)], half: 3 }]
    const arch = buildArchways([box], [10], ways, flat)
    expect(arch.openedCount).toBe(0)
    expect(arch.footprints).toEqual([box])
  })
})
