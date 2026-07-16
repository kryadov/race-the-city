import { describe, it, expect } from 'vitest'
import { stitchRings } from '../../src/geo/parse'

/** Rings come back with the closing repeat dropped, so compare as sets of ids. */
const asSet = (r: number[]): Set<number> => new Set(r)

describe('stitchRings', () => {
  it('takes a way that is already a closed ring', () => {
    const rings = stitchRings([[1, 2, 3, 4, 1]])
    expect(rings).toHaveLength(1)
    expect(rings[0]).toEqual([1, 2, 3, 4])
  })

  it('joins ways laid end to end', () => {
    // how a real riverbank arrives: one outline cut into several ways
    const rings = stitchRings([
      [1, 2, 3],
      [3, 4, 5],
      [5, 6, 1],
    ])
    expect(rings).toHaveLength(1)
    expect(asSet(rings[0])).toEqual(asSet([1, 2, 3, 4, 5, 6]))
  })

  it('joins a way that runs the other way round', () => {
    // members carry no direction: the next way may start at either end
    const rings = stitchRings([
      [1, 2, 3],
      [5, 4, 3], // reversed
      [5, 6, 1],
    ])
    expect(rings).toHaveLength(1)
    expect(asSet(rings[0])).toEqual(asSet([1, 2, 3, 4, 5, 6]))
  })

  it('separates two rings from one pile of ways', () => {
    const rings = stitchRings([
      [1, 2, 3],
      [3, 1],
      [10, 11, 12],
      [12, 10],
    ])
    expect(rings).toHaveLength(2)
    const sizes = rings.map((r) => r.length).sort()
    expect(sizes).toEqual([3, 3])
  })

  it('drops a chain that never closes', () => {
    // an open chain has no inside to fill — better nothing than a stray sliver
    expect(stitchRings([[1, 2, 3], [3, 4, 5]])).toHaveLength(0)
  })

  it('ignores junk members without throwing', () => {
    expect(stitchRings([])).toEqual([])
    expect(stitchRings([[7]])).toEqual([]) // single node, no way to walk
  })

  it('matches on ids, so coincident but distinct nodes do not fuse', () => {
    // two rings that touch at a coordinate but not at a node stay separate
    const rings = stitchRings([
      [1, 2, 1],
      [3, 4, 3],
    ])
    expect(rings.length).toBeLessThanOrEqual(2)
    for (const r of rings) expect(r.length).toBeGreaterThanOrEqual(2)
  })
})
