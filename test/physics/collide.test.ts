import { describe, it, expect } from 'vitest'
import { pointInPolygon, resolveCircle, roofUnder } from '../../src/physics/collide'
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

describe('flying over an obstacle', () => {
  // A 20m square building, 8m tall, sitting at the origin.
  const box: Vec2[] = [
    { x: -10, z: -10 },
    { x: 10, z: -10 },
    { x: 10, z: 10 },
    { x: -10, z: 10 },
  ]
  const grid = new SpatialGrid([box], 25, [8])

  it('lets a car that is over the roof carry straight on', () => {
    expect(resolveCircle(0, 0, 2, grid, 9)).toEqual({ x: 0, z: 0 })
  })

  it('still stops one that is not high enough', () => {
    const p = resolveCircle(0, 0, 2, grid, 3)
    expect(Math.hypot(p.x, p.z), 'it should have been shoved out of the wall').toBeGreaterThan(1)
  })

  it('stops it at the roofline, not a metre under', () => {
    // Level with the top counts as over it: you are on the roof, not in the wall.
    expect(resolveCircle(0, 0, 2, grid, 8)).toEqual({ x: 0, z: 0 })
    expect(resolveCircle(0, 0, 2, grid, 7.99)).not.toEqual({ x: 0, z: 0 })
  })

  it('never flies over something whose height nobody stated', () => {
    // An obstacle of unknown height is not one to gamble a car on.
    const blind = new SpatialGrid([box], 25)
    expect(resolveCircle(0, 0, 2, blind, 500)).not.toEqual({ x: 0, z: 0 })
  })

  it('collides as it always did when the caller says nothing about height', () => {
    expect(resolveCircle(0, 0, 2, grid)).not.toEqual({ x: 0, z: 0 })
  })
})

describe('roofUnder', () => {
  const low: Vec2[] = [
    { x: -10, z: -10 },
    { x: 10, z: -10 },
    { x: 10, z: 10 },
    { x: -10, z: 10 },
  ]
  // A tower overlapping the low block's eastern half.
  const tall: Vec2[] = [
    { x: 0, z: -10 },
    { x: 20, z: -10 },
    { x: 20, z: 10 },
    { x: 0, z: 10 },
  ]

  it('is the roof you are over', () => {
    expect(roofUnder(-5, 0, new SpatialGrid([low], 25, [8]))).toBe(8)
  })

  it('is nothing at all over open ground', () => {
    expect(roofUnder(50, 50, new SpatialGrid([low], 25, [8]))).toBeNull()
  })

  it('is the highest one where they overlap — you land on the tower, not through it', () => {
    expect(roofUnder(5, 0, new SpatialGrid([low, tall], 25, [8, 30]))).toBe(30)
  })

  it('will not land you on something of unstated height', () => {
    expect(roofUnder(-5, 0, new SpatialGrid([low], 25))).toBeNull()
  })
})
