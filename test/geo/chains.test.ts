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

describe('joinChains at junctions', () => {
  it('refuses to join through a junction', () => {
    // Three ways meet at node 3. There is no "continuation" — joining blind
    // walks off into a branch and doubles the line back on itself, which the
    // mitred ribbon renders as a fan of garbage triangles.
    const chains = joinChains([
      [1, 2, 3], // arrives at the junction
      [3, 4, 5], // one branch
      [3, 6, 7], // another
    ])
    expect(chains).toHaveLength(3)
    for (const c of chains) expect(c.length).toBe(3)
  })

  it('still joins a plain two-way seam', () => {
    // exactly two ends at node 3: unambiguous, so it joins
    const chains = joinChains([
      [1, 2, 3],
      [3, 4, 5],
    ])
    expect(chains).toHaveLength(1)
    expect(chains[0]).toHaveLength(5)
  })

  it('joins the plain seams of a line that also has a junction', () => {
    const chains = joinChains([
      [1, 2],
      [2, 3], // node 2: two ends, joinable
      [3, 4], // node 3: three ends (this, the above, and the spur) — a junction
      [3, 9],
    ])
    // the 1-2-3 run merges; the branches at 3 stay put
    expect(chains.some((c) => c.length >= 3)).toBe(true)
    expect(chains.length).toBeGreaterThan(1)
  })

  it('never produces a line that doubles back on itself', () => {
    const chains = joinChains([
      [1, 2, 3],
      [3, 4, 5],
      [3, 6, 7],
    ])
    for (const c of chains) {
      expect(new Set(c).size, 'a node visited twice means the line folded').toBe(c.length)
    }
  })
})

describe('railway kinds are never joined across', () => {
  it('does not weld a surface line to the tunnel it dives into', () => {
    // The join is done per (tram, tunnel) group in parseOsm; joinChains itself
    // must therefore never be handed two kinds at once. This pins the contract:
    // given only one kind's ways, it joins them; the caller keeps them apart.
    const surface = joinChains([[1, 2, 3]])
    const tunnel = joinChains([[3, 4, 5]])
    expect(surface).toHaveLength(1)
    expect(tunnel).toHaveLength(1)
    expect(surface[0]).not.toEqual(tunnel[0])
  })
})
