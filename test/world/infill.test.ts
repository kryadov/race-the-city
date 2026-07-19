import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  buildInfill,
  collectInfill,
  makeRng,
  INFILL_BENCH_CAP,
  INFILL_TREE_CAP,
} from '../../src/world/infill'
import { pointInPolygon } from '../../src/physics/collide'
import type { Building, Road, Vec2 } from '../../src/geo/types'

const flat = { heightAt: () => 0 }

/** A `size`-metre square building, cornered at (ox, oz). */
function building(ox: number, oz: number, size: number): Building {
  return {
    footprint: [
      { x: ox, z: oz },
      { x: ox + size, z: oz },
      { x: ox + size, z: oz + size },
      { x: ox, z: oz + size },
    ],
    height: 12,
    kind: 'house',
  }
}

/** A row of buildings with ~gap-metre gaps between them — the empty ground infill targets. */
function street(count: number, size: number, gap: number): Building[] {
  const out: Building[] = []
  for (let i = 0; i < count; i++) out.push(building(i * (size + gap), 0, size))
  return out
}

/** Squared distance from (x,z) to segment a-b. */
function segDist2(x: number, z: number, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dz = b.z - a.z
  const len2 = dx * dx + dz * dz
  const t = len2 > 1e-9 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2)) : 0
  return (x - (a.x + dx * t)) ** 2 + (z - (a.z + dz * t)) ** 2
}

/** Every placed point — benches and trees together. */
function allPoints(s: ReturnType<typeof collectInfill>): Vec2[] {
  return [...s.benches.map((b) => ({ x: b.x, z: b.z })), ...s.trees]
}

describe('collectInfill', () => {
  it('fills the empty gaps of a street of buildings', () => {
    const spots = collectInfill(street(6, 16, 14), [], [], [], makeRng(1))
    expect(spots.benches.length + spots.trees.length).toBeGreaterThan(0)
  })

  it('never lands inside a building footprint', () => {
    const buildings = street(6, 16, 14)
    const spots = collectInfill(buildings, [], [], [], makeRng(2))
    for (const p of allPoints(spots)) {
      for (const b of buildings) {
        expect(pointInPolygon(p.x, p.z, b.footprint), `${p.x},${p.z} inside a building`).toBe(false)
      }
    }
  })

  it('keeps clear of the roads', () => {
    const buildings = street(6, 16, 14)
    // A road running straight down the gap between the first two buildings.
    const road: Road = { points: [{ x: 22, z: -40 }, { x: 22, z: 40 }], kind: 'residential' }
    const spots = collectInfill(buildings, [road], [], [], makeRng(3))
    for (const p of allPoints(spots)) {
      expect(segDist2(p.x, p.z, road.points[0], road.points[1]), `${p.x},${p.z} on the road`).toBeGreaterThanOrEqual(5.9 ** 2)
    }
  })

  it('keeps clear of the blockers (mapped trees / props)', () => {
    const buildings = street(6, 16, 14)
    const blockers: Vec2[] = [{ x: 23, z: 8 }, { x: 55, z: -10 }, { x: 40, z: 20 }]
    const spots = collectInfill(buildings, [], blockers, [], makeRng(4))
    for (const p of allPoints(spots)) {
      for (const g of blockers) {
        expect(Math.hypot(p.x - g.x, p.z - g.z), `${p.x},${p.z} on a blocker`).toBeGreaterThanOrEqual(5.9)
      }
    }
  })

  it('stays out of the water', () => {
    const buildings = street(6, 16, 14)
    const pond: Vec2[] = [{ x: 20, z: 6 }, { x: 34, z: 6 }, { x: 34, z: 20 }, { x: 20, z: 20 }]
    const spots = collectInfill(buildings, [], [], [pond], makeRng(5))
    for (const p of allPoints(spots)) {
      expect(pointInPolygon(p.x, p.z, pond), `${p.x},${p.z} in the water`).toBe(false)
    }
  })

  it('respects the map-wide caps', () => {
    // A dense field of buildings with wide gaps — far more room than the caps allow.
    const spots = collectInfill(street(40, 12, 20), [], [], [], makeRng(6))
    expect(spots.benches.length).toBeLessThanOrEqual(INFILL_BENCH_CAP)
    expect(spots.trees.length).toBeLessThanOrEqual(INFILL_TREE_CAP)
  })

  it('is deterministic for a given seed', () => {
    const buildings = street(8, 16, 14)
    const a = collectInfill(buildings, [], [], [], makeRng(7))
    const b = collectInfill(buildings, [], [], [], makeRng(7))
    expect(a.benches.length).toBe(b.benches.length)
    expect(a.trees.length).toBe(b.trees.length)
    expect(a.benches[0]).toEqual(b.benches[0])
    expect(a.trees[0]).toEqual(b.trees[0])
  })

  it('does nothing without buildings', () => {
    const spots = collectInfill([], [], [], [], makeRng(8))
    expect(spots.benches).toEqual([])
    expect(spots.trees).toEqual([])
  })

  it('does not scatter out in the open, far from any building', () => {
    // A lone building; a point 500m away is open country, not an inter-building gap.
    const spots = collectInfill([building(0, 0, 16)], [], [], [], makeRng(9))
    for (const p of allPoints(spots)) {
      expect(Math.hypot(p.x - 8, p.z - 8)).toBeLessThan(100)
    }
  })
})

describe('buildInfill', () => {
  it('returns one group of instanced benches and trees on the terrain', () => {
    const group = buildInfill(street(6, 16, 14), [], [], [], flat, makeRng(10))
    expect(group).toBeInstanceOf(THREE.Object3D)
    const instanced = group.children.filter((c) => c instanceof THREE.InstancedMesh)
    expect(instanced.length).toBeGreaterThan(0)
  })

  it('no-ops to an empty group without buildings', () => {
    const group = buildInfill([], [], [], [], flat, makeRng(11))
    expect(group.children.length).toBe(0)
  })
})
