import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createChase, roundOutcome, nearestCopDist, farNodes, CATCH_R, EVADE_TIME } from '../../src/app/chase'
import { SpatialGrid } from '../../src/physics/grid'
import type { Road } from '../../src/geo/types'
import type { RoadGraph } from '../../src/world/roadGraph'

const provider = { heightAt: () => 0 }
const emptyGrid = new SpatialGrid([], 25)

/** A dense grid of drivable road points, wide enough for cops to spawn far off. */
function roads(): Road[] {
  const points = []
  for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) points.push({ x: i * 80 - 760, z: j * 80 - 760 })
  return [{ points, kind: 'residential' }]
}

/** Deterministic PRNG (mulberry32) so a spawn layout is reproducible. */
function makeRand(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('roundOutcome (the win/lose rule)', () => {
  it('plays on while the clock runs and no cop is close', () => {
    expect(roundOutcome(30, 100)).toBe('ongoing')
  })
  it('escapes when the clock reaches zero and you are clear', () => {
    expect(roundOutcome(0, 100)).toBe('escaped')
    expect(roundOutcome(-0.1, 100)).toBe('escaped')
  })
  it('busts you when a cop is within the catch radius', () => {
    expect(roundOutcome(30, CATCH_R - 0.1)).toBe('busted')
  })
  it('lets a catch beat the clock — busted wins a tie', () => {
    expect(roundOutcome(0, CATCH_R - 0.1)).toBe('busted')
  })
})

describe('nearestCopDist', () => {
  it('is the distance to the closest cop', () => {
    expect(nearestCopDist([{ x: 30, z: 0 }, { x: 5, z: 0 }], { x: 0, z: 0 })).toBe(5)
  })
  it('is Infinity with no cops', () => {
    expect(nearestCopDist([], { x: 0, z: 0 })).toBe(Infinity)
  })
})

describe('farNodes (cop spawn picks)', () => {
  // A line of nodes 0,10,20,…,990 metres out along +x.
  const graph: RoadGraph = {
    nodes: Array.from({ length: 100 }, (_, i) => ({ x: i * 10, z: 0, links: [] })),
    nearest: () => -1,
  }
  it('never spawns a cop nearer than minDist to the player', () => {
    const picks = farNodes(graph, { x: 0, z: 0 }, 2, 220, makeRand(1))
    expect(picks).toHaveLength(2)
    for (const p of picks) expect(graph.nodes[p].x).toBeGreaterThanOrEqual(220)
  })
  it('picks distinct nodes', () => {
    const picks = farNodes(graph, { x: 0, z: 0 }, 2, 220, makeRand(9))
    expect(new Set(picks).size).toBe(picks.length)
  })
  it('is empty on an empty graph (the caller rings the cops instead)', () => {
    expect(farNodes({ nodes: [], nearest: () => -1 }, { x: 0, z: 0 }, 2, 220, makeRand(1))).toEqual([])
  })
})

describe('chase mode', () => {
  it('spawns cops well clear of the player at the start of a round', () => {
    const chase = createChase(new THREE.Scene(), makeRand(1))
    chase.setEnabled(true)
    chase.reset(roads(), emptyGrid, provider, { x: 0, z: 0 })
    const cop = chase.target()
    expect(cop, 'no cop was spawned').not.toBeNull()
    // Not on top of you — a chase, not an ambush.
    expect(Math.hypot(cop!.x, cop!.z)).toBeGreaterThan(CATCH_R)
    expect(chase.state().timeLeft).toBeGreaterThan(EVADE_TIME - 1)
    expect(chase.state().score).toBe(0)
  })

  it('busts you when you end up on a cop, holding the score and starting a new round', () => {
    const chase = createChase(new THREE.Scene(), makeRand(2))
    chase.setEnabled(true)
    chase.reset(roads(), emptyGrid, provider, { x: 0, z: 0 })
    const cop = chase.target()!
    const before = chase.state().score

    // Drive the player right onto the nearest cop — inside the catch radius.
    const s = chase.update(0.1, { x: cop.x, z: cop.z })
    expect(s.justBusted).toBe(true)
    expect(s.justEscaped).toBe(false)
    expect(s.score).toBe(before) // a bust never scores

    // A fresh round has put the cops back out far from where you were caught.
    const next = chase.target()!
    expect(Math.hypot(next.x - cop.x, next.z - cop.z)).toBeGreaterThan(CATCH_R)
    expect(chase.state().timeLeft).toBeGreaterThan(EVADE_TIME - 1)
  })

  it('counts the clock down and escapes at zero, scoring the round', () => {
    const chase = createChase(new THREE.Scene(), makeRand(3))
    chase.setEnabled(true)
    chase.reset(roads(), emptyGrid, provider, { x: 0, z: 0 })
    const start = chase.state().timeLeft

    // One frame in, far from any cop: the clock has ticked down, no verdict yet.
    const first = chase.update(1, { x: 5000, z: 5000 })
    expect(first.timeLeft).toBeLessThan(start) // it did count down
    expect(first.justEscaped).toBe(false)

    // Flee far away every frame: the cops (capped, starting ~220m off) can never
    // close a 5 km gap in one evade window, so the clock runs out — an escape.
    let escaped = false
    let s = first
    for (let i = 0; i < EVADE_TIME + 5 && !escaped; i++) {
      s = chase.update(1, { x: 5000, z: 5000 })
      escaped = s.justEscaped
    }
    expect(escaped, 'never escaped').toBe(true)
    expect(s.score).toBe(1) // an escape scores one, and resets for the next round
    expect(chase.state().timeLeft).toBeGreaterThan(EVADE_TIME - 2) // a fresh clock
  })

  it('does nothing while disabled', () => {
    const chase = createChase(new THREE.Scene(), makeRand(4))
    chase.reset(roads(), emptyGrid, provider, { x: 0, z: 0 })
    const s = chase.update(1, { x: 0, z: 0 })
    expect(s.active).toBe(false)
    expect(chase.target()).toBeNull()
  })
})
