import { describe, it, expect } from 'vitest'
import { buildRoadGraph, nextNode, roomToDrive } from '../../src/world/roadGraph'
import { angleDelta } from '../../src/app/autopilot'
import type { Road, Vec2 } from '../../src/geo/types'

const v = (x: number, z: number): Vec2 => ({ x, z })
const road = (points: Vec2[], kind: Road['kind'] = 'residential'): Road => ({ points, kind })

/** Two roads crossing at (50,0) — the junction OSM never states outright. */
const cross: Road[] = [
  road([v(0, 0), v(50, 0), v(100, 0)]),
  road([v(50, -50), v(50, 0), v(50, 50)]),
]

describe('buildRoadGraph', () => {
  it('welds roads that meet, so a junction is a junction', () => {
    const g = buildRoadGraph(cross)
    const j = g.nearest(50, 0)
    expect(g.nodes[j].links.length, 'a crossroads has four ways out').toBe(4)
  })

  it('does not weld roads that merely pass close by', () => {
    const near = buildRoadGraph([road([v(0, 0), v(100, 0)]), road([v(0, 5), v(100, 5)])])
    for (const n of near.nodes) expect(n.links.length).toBeLessThanOrEqual(2)
  })

  it('leaves footpaths out — a car has no business on them', () => {
    const g = buildRoadGraph([road([v(0, 0), v(100, 0)], 'path')])
    expect(g.nodes).toHaveLength(0)
  })

  it('links each vertex to its neighbours along the way', () => {
    const g = buildRoadGraph([road([v(0, 0), v(10, 0), v(20, 0)])])
    expect(g.nodes).toHaveLength(3)
    expect(g.nodes[0].links).toEqual([1]) // an end has one
    expect(g.nodes[1].links.sort()).toEqual([0, 2]) // the middle has two
  })

  it('finds the nearest node, and copes with an empty graph', () => {
    expect(buildRoadGraph(cross).nearest(48, 1)).toBe(buildRoadGraph(cross).nearest(50, 0))
    expect(buildRoadGraph([]).nearest(0, 0)).toBe(-1)
  })
})

describe('nextNode', () => {
  const g = buildRoadGraph(cross)
  const j = g.nearest(50, 0)
  const west = g.nearest(0, 0)
  const rand = (): number => 0 // no jitter, so the choice is the straight one

  it('carries straight on through a junction', () => {
    // arriving from the west, it should keep going east rather than turn off
    const out = nextNode(g, west, j, rand)
    expect(g.nodes[out].x).toBeGreaterThan(50)
    expect(g.nodes[out].z).toBeCloseTo(0)
  })

  it('never doubles back where there is any other way', () => {
    for (let i = 0; i < 20; i++) expect(nextNode(g, west, j, Math.random)).not.toBe(west)
  })

  it('turns around at a dead end rather than stopping', () => {
    const stub = buildRoadGraph([road([v(0, 0), v(10, 0)])])
    const end = stub.nearest(10, 0)
    const start = stub.nearest(0, 0)
    expect(nextNode(stub, start, end, rand)).toBe(start)
  })

  it('stays put on an isolated node instead of throwing', () => {
    const g0 = buildRoadGraph([])
    expect(nextNode(g0, -1, 0, rand)).toBe(0)
  })
})

describe('angleDelta', () => {
  it('takes the short way round', () => {
    expect(angleDelta(0, 0.5)).toBeCloseTo(0.5)
    expect(angleDelta(0, -0.5)).toBeCloseTo(-0.5)
    // 350° to 10° is a 20° right turn, not a 340° left one
    expect(angleDelta(-Math.PI * 0.95, Math.PI * 0.95)).toBeCloseTo(-Math.PI * 0.1, 5)
  })

  it('stays within half a turn either way', () => {
    for (let a = -10; a < 10; a += 0.3) {
      for (let b = -10; b < 10; b += 0.7) {
        const d = angleDelta(a, b)
        expect(d).toBeGreaterThan(-Math.PI - 1e-9)
        expect(d).toBeLessThanOrEqual(Math.PI + 1e-9)
      }
    }
  })
})

describe('tunnels are not part of the network', () => {
  it('leaves a tunnel out of the driving graph', () => {
    // A tunnel runs under the buildings, which are solid: routing a car down one
    // drives it into a wall. Monaco is largely tunnels.
    const g = buildRoadGraph([{ points: [v(0, 0), v(100, 0)], kind: 'primary', tunnel: true }])
    expect(g.nodes).toHaveLength(0)
  })

  it('still takes the surface road beside it', () => {
    const g = buildRoadGraph([
      { points: [v(0, 0), v(100, 0)], kind: 'primary', tunnel: true },
      { points: [v(0, 50), v(100, 50)], kind: 'primary' },
    ])
    expect(g.nodes.length).toBeGreaterThan(0)
    for (const n of g.nodes) expect(n.z).toBe(50) // only the surface one
  })
})

describe('roomToDrive', () => {
  const chain = (n: number, step = 20): Road => ({
    kind: 'residential',
    points: Array.from({ length: n }, (_, i) => ({ x: i * step, z: 0 })),
  })

  it('a long street has room', () => {
    const g = buildRoadGraph([chain(20)])
    expect(roomToDrive(g, g.nearest(0, 0))).toBe(true)
  })

  it('a 40m stub does not — that is where the cars sat turning round', () => {
    const g = buildRoadGraph([chain(3)])
    expect(roomToDrive(g, g.nearest(0, 0))).toBe(false)
  })

  it('a little loop is still a pocket, however many turns it has', () => {
    // A service loop behind a shop: you can drive it forever and get nowhere.
    const loop: Road = {
      kind: 'service',
      points: [
        { x: 0, z: 0 },
        { x: 30, z: 0 },
        { x: 30, z: 30 },
        { x: 0, z: 30 },
        { x: 0, z: 0 },
      ],
    }
    const g = buildRoadGraph([loop])
    expect(roomToDrive(g, g.nearest(0, 0))).toBe(false)
  })

  it('a stub that joins a real road does have room', () => {
    const g = buildRoadGraph([chain(3), { kind: 'residential', points: [{ x: 40, z: 0 }, { x: 40, z: 400 }] }])
    expect(roomToDrive(g, g.nearest(0, 0))).toBe(true)
  })

  it('says no about a node that is not there', () => {
    expect(roomToDrive(buildRoadGraph([chain(20)]), -1)).toBe(false)
  })
})
