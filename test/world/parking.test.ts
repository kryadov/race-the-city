import { describe, it, expect } from 'vitest'
import { bayLines, ringAngle } from '../../src/world/parking'
import { isParking } from '../../src/geo/parse'
import { pointInPolygon } from '../../src/physics/collide'
import type { Vec2 } from '../../src/geo/types'

const v = (x: number, z: number): Vec2 => ({ x, z })
/** A 40 x 20 car park, long side along x. */
const lot: Vec2[] = [v(0, 0), v(40, 0), v(40, 20), v(0, 20)]

describe('isParking', () => {
  it('takes open tarmac', () => {
    expect(isParking({ amenity: 'parking' })).toBe(true)
    expect(isParking({ amenity: 'parking', parking: 'surface' })).toBe(true)
  })

  it('leaves the structures to the building code', () => {
    // a multi-storey is a building; painting bays on its roof would be wrong
    expect(isParking({ amenity: 'parking', building: 'yes' })).toBe(false)
    expect(isParking({ amenity: 'parking', parking: 'multi-storey' })).toBe(false)
    expect(isParking({ amenity: 'parking', parking: 'underground' })).toBe(false)
  })

  it('ignores everything else', () => {
    expect(isParking({ amenity: 'cafe' })).toBe(false)
    expect(isParking({})).toBe(false)
  })
})

describe('ringAngle', () => {
  it('follows the longest edge', () => {
    expect(Math.abs(Math.sin(ringAngle(lot)))).toBeCloseTo(0) // runs along x
    const tall: Vec2[] = [v(0, 0), v(20, 0), v(20, 40), v(0, 40)]
    expect(Math.abs(Math.cos(ringAngle(tall)))).toBeCloseTo(0) // runs along z
  })
})

describe('bayLines', () => {
  it('marks bays out inside the lot', () => {
    const bays = bayLines(lot)
    expect(bays.length).toBeGreaterThan(10)
    for (const b of bays) expect(pointInPolygon(b.x, b.z, lot), `${b.x},${b.z}`).toBe(true)
  })

  it('never paints outside the tarmac', () => {
    // an L-shape: the bounding box covers ground the lot does not
    const L: Vec2[] = [v(0, 0), v(40, 0), v(40, 10), v(10, 10), v(10, 30), v(0, 30)]
    for (const b of bayLines(L)) expect(pointInPolygon(b.x, b.z, L)).toBe(true)
  })

  it('leaves an aisle rather than tiling the lot solid', () => {
    // 40x20 at 2.5m a bay would be 128 spaces if it were paved wall to wall
    expect(bayLines(lot).length).toBeLessThan(80)
  })

  it('respects the cap on a huge lot', () => {
    const huge: Vec2[] = [v(0, 0), v(600, 0), v(600, 400), v(0, 400)]
    expect(bayLines(huge, 50).length).toBeLessThanOrEqual(50)
  })

  it('gives up on a scrap of tarmac rather than throwing', () => {
    expect(() => bayLines([v(0, 0), v(0.4, 0), v(0.4, 0.4)])).not.toThrow()
  })
})
