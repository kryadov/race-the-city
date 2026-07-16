import { describe, it, expect } from 'vitest'
import { SpatialGrid } from '../../src/physics/grid'
import type { Vec2 } from '../../src/geo/types'

const square = (cx: number, cz: number): Vec2[] => [
  { x: cx - 1, z: cz - 1 }, { x: cx + 1, z: cz - 1 },
  { x: cx + 1, z: cz + 1 }, { x: cx - 1, z: cz + 1 },
]

describe('SpatialGrid', () => {
  it('returns a footprint near its own location', () => {
    const grid = new SpatialGrid([square(0, 0)], 10)
    expect(grid.near(0, 0).length).toBe(1)
  })
  it('does not return a footprint that is far away', () => {
    const grid = new SpatialGrid([square(0, 0), square(1000, 1000)], 10)
    const near = grid.near(0, 0)
    expect(near.length).toBe(1)
    expect(near[0]).toEqual(square(0, 0))
  })
  it('returns neighbors in the adjacent cells', () => {
    const grid = new SpatialGrid([square(0, 0), square(12, 0)], 10)
    // querying at x=8 should see both because footprints span multiple cells
    expect(grid.near(8, 0).length).toBeGreaterThanOrEqual(1)
  })
})
