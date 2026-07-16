import { describe, it, expect } from 'vitest'
import { joinChains } from '../../src/geo/parse'

/** A line has no inherent direction, so either way round is the same line. */
const sameLine = (got: number[], want: number[]): void => {
  const rev = [...want].reverse()
  expect(got.join() === want.join() || got.join() === rev.join(), `got ${got}`).toBe(true)
}

describe('joinChains', () => {
  it('joins fragments laid end to end', () => {
    // how a railway arrives: cut at every bridge and junction
    const chains = joinChains([
      [1, 2, 3],
      [3, 4, 5],
      [5, 6, 7],
    ])
    expect(chains).toHaveLength(1)
    sameLine(chains[0], [1, 2, 3, 4, 5, 6, 7])
  })

  it('joins a fragment that runs the other way', () => {
    const chains = joinChains([
      [1, 2, 3],
      [5, 4, 3],
    ])
    expect(chains).toHaveLength(1)
    sameLine(chains[0], [1, 2, 3, 4, 5])
  })

  it('joins onto the front as well as the back', () => {
    const chains = joinChains([
      [3, 4, 5],
      [1, 2, 3],
    ])
    expect(chains).toHaveLength(1)
    sameLine(chains[0], [1, 2, 3, 4, 5])
  })

  it('keeps separate lines separate', () => {
    const chains = joinChains([
      [1, 2],
      [2, 3],
      [10, 11],
      [11, 12],
    ])
    expect(chains).toHaveLength(2)
    expect(chains.map((c) => c.length).sort()).toEqual([3, 3])
  })

  it('does not walk a loop forever', () => {
    const chains = joinChains([
      [1, 2],
      [2, 3],
      [3, 1],
    ])
    expect(chains.length).toBeGreaterThan(0)
    expect(chains[0].length).toBeLessThan(10)
  })

  it('copes with junk', () => {
    expect(joinChains([])).toEqual([])
    expect(joinChains([[5]])).toEqual([])
  })

  it('makes a longer line than the fragments it was given', () => {
    // the whole point: fragments end mid-map, and a train has to do something there
    const chains = joinChains([[1, 2], [2, 3], [3, 4], [4, 5], [5, 6]])
    expect(chains[0].length).toBeGreaterThan(2)
  })
})
