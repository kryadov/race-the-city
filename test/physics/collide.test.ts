import { describe, it, expect } from 'vitest'
import { pointInPolygon, resolveCircle } from '../../src/physics/collide'
import { SpatialGrid } from '../../src/physics/grid'
import type { Vec2 } from '../../src/geo/types'

const box: Vec2[] = [
  { x: -10, z: -10 }, { x: 10, z: -10 }, { x: 10, z: 10 }, { x: -10, z: 10 },
]

describe('pointInPolygon', () => {
  it('detects inside and outside', () => {
    expect(pointInPolygon(0, 0, box)).toBe(true)
    expect(pointInPolygon(50, 50, box)).toBe(false)
  })
})

describe('resolveCircle', () => {
  const grid = new SpatialGrid([box], 25)

  it('leaves a car outside the building untouched', () => {
    const p = resolveCircle(40, 0, 2, grid)
    expect(p.x).toBeCloseTo(40)
    expect(p.z).toBeCloseTo(0)
  })

  it('pushes a car that entered the building back outside', () => {
    const p = resolveCircle(8, 0, 2, grid) // inside near the +x wall
    expect(p.x).toBeGreaterThan(10) // pushed out past the wall + radius
    expect(pointInPolygon(p.x, p.z, box)).toBe(false)
  })

  it('pushes out along the nearest edge (keeps the other axis roughly stable)', () => {
    const p = resolveCircle(9, 3, 2, grid) // closest to +x wall
    expect(p.x).toBeGreaterThan(10)
    expect(Math.abs(p.z - 3)).toBeLessThan(2)
  })
})
