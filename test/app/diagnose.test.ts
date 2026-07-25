import { describe, it, expect } from 'vitest'
import { describeSolids, type SolidSource } from '../../src/app/diagnose'
import type { Vec2 } from '../../src/geo/types'

const box = (cx: number, cz: number, r: number): Vec2[] => [
  { x: cx - r, z: cz - r },
  { x: cx + r, z: cz - r },
  { x: cx + r, z: cz + r },
  { x: cx - r, z: cz + r },
]

const sources: SolidSource[] = [
  { name: 'building', polys: [box(20, 0, 5)], tops: [31.4] },
  { name: 'quay', polys: [box(3, 0, 0.3)], tops: [9.5] },
]

describe('describeSolids', () => {
  it('names the nearest wall, how far off it is and how high it stands', () => {
    const line = describeSolids(0, 0, sources)
    expect(line).toContain('quay@2.7m')
    expect(line).toContain('top9.5')
  })

  it('sorts by distance and keeps the line short', () => {
    const line = describeSolids(0, 0, sources, [], 20, 2)
    expect(line.indexOf('quay')).toBeLessThan(line.indexOf('building'))
  })

  it('says plainly when nothing static is near — that is the answer too', () => {
    expect(describeSolids(500, 500, sources)).toContain('none within 8m')
  })

  it('counts the movers apart from the walls, with the height they sit at', () => {
    const line = describeSolids(0, 0, sources, [{ x: 4, z: 0, r: 2, y: 12.5 }])
    expect(line).toContain('movers: 1@2.0m')
    expect(line).toContain('y12.5')
  })

  it('leaves the movers out when none is in reach', () => {
    expect(describeSolids(0, 0, sources, [{ x: 60, z: 0, r: 2 }])).not.toContain('movers')
  })

  it('ignores a wall outside the radius', () => {
    expect(describeSolids(0, 0, [{ name: 'building', polys: [box(20, 0, 5)] }])).toContain('none within')
  })
})
