import { describe, it, expect } from 'vitest'
import { findRoute } from '../../src/world/route'
import type { RoadGraph } from '../../src/world/roadGraph'

/** A graph from a list of positions and undirected links. */
function graphOf(pts: [number, number][], links: [number, number][]): RoadGraph {
  const nodes = pts.map(([x, z]) => ({ x, z, links: [] as number[] }))
  for (const [a, b] of links) {
    nodes[a].links.push(b)
    nodes[b].links.push(a)
  }
  return { nodes, nearest: () => -1 }
}

describe('findRoute', () => {
  it('walks a chain end to end', () => {
    const g = graphOf(
      [
        [0, 0],
        [10, 0],
        [20, 0],
      ],
      [
        [0, 1],
        [1, 2],
      ],
    )
    expect(findRoute(g, 0, 2)).toEqual([0, 1, 2])
  })

  it('takes the shorter of two ways round', () => {
    // 0 -> 1 -> 3 is 20m; 0 -> 2 -> 3 detours 200m out and back.
    const g = graphOf(
      [
        [0, 0],
        [10, 0],
        [0, 100],
        [20, 0],
      ],
      [
        [0, 1],
        [1, 3],
        [0, 2],
        [2, 3],
      ],
    )
    expect(findRoute(g, 0, 3)).toEqual([0, 1, 3])
  })

  it('returns nothing when the goal is on another island', () => {
    const g = graphOf(
      [
        [0, 0],
        [10, 0],
        [500, 500],
      ],
      [[0, 1]],
    )
    expect(findRoute(g, 0, 2)).toEqual([])
  })

  it('gives up rather than searching a whole city for an unreachable node', () => {
    // A long chain plus one stranded node: without a cap this visits every node.
    const pts: [number, number][] = []
    const links: [number, number][] = []
    for (let i = 0; i < 200; i++) {
      pts.push([i * 10, 0])
      if (i > 0) links.push([i - 1, i])
    }
    pts.push([0, 9999])
    const g = graphOf(pts, links)
    expect(findRoute(g, 0, 200, 20)).toEqual([])
  })

  it('is a single node when you are already there', () => {
    const g = graphOf([[0, 0]], [])
    expect(findRoute(g, 0, 0)).toEqual([0])
  })

  it('has nothing to say about a node that is not in the graph', () => {
    const g = graphOf([[0, 0]], [])
    expect(findRoute(g, 0, 7)).toEqual([])
    expect(findRoute(g, -1, 0)).toEqual([])
  })
})
