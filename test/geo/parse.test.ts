import { describe, it, expect } from 'vitest'
import fixture from '../fixtures/overpass-small.json'
import { parseOsm, classifyRoad, buildingHeight, type OverpassResponse } from '../../src/geo/parse'
import { Projector } from '../../src/geo/project'

const projector = new Projector({ lat: 41.7151, lon: 44.8271 })

describe('classifyRoad', () => {
  it('maps known highway tags', () => {
    expect(classifyRoad('motorway')).toBe('motorway')
    expect(classifyRoad('residential')).toBe('residential')
    expect(classifyRoad('footway')).toBe('path')
  })
  it('falls back to other for unknown/missing', () => {
    expect(classifyRoad(undefined)).toBe('other')
    expect(classifyRoad('unclassified')).toBe('other')
  })
})

describe('buildingHeight', () => {
  it('uses explicit height in meters', () => {
    expect(buildingHeight({ height: '8' })).toBeCloseTo(8)
  })
  it('derives height from levels (3m per level)', () => {
    expect(buildingHeight({ 'building:levels': '5' })).toBeCloseTo(15)
  })
  it('defaults when no tags present', () => {
    expect(buildingHeight({})).toBeGreaterThan(0)
  })
})

describe('parseOsm', () => {
  const world = parseOsm(fixture as OverpassResponse, projector)

  it('extracts roads with points and kind', () => {
    expect(world.roads.length).toBe(2)
    const motorway = world.roads.find((r) => r.kind === 'motorway')!
    expect(motorway.points.length).toBe(2)
  })

  it('ignores ways without highway or building tags', () => {
    // the amenity=cafe way must not become a road or building
    const total = world.roads.length + world.buildings.length
    expect(total).toBe(4) // 2 roads + 2 buildings
  })

  it('extracts buildings with a closed footprint and a height', () => {
    expect(world.buildings.length).toBe(2)
    const tall = world.buildings.find((b) => b.height > 10)!
    expect(tall.height).toBeCloseTo(15)
    expect(tall.footprint.length).toBeGreaterThanOrEqual(3)
  })

  it('extracts water polygons', () => {
    expect(world.water.length).toBe(1)
    expect(world.water[0].length).toBeGreaterThanOrEqual(3)
  })

  it('extracts green areas and tree points', () => {
    expect(world.green.length).toBe(1)
    expect(world.green[0].length).toBeGreaterThanOrEqual(3)
    expect(world.trees.length).toBe(1)
  })

  it('extracts coastline as an open polyline', () => {
    expect(world.coast.length).toBe(1)
    expect(world.coast[0].length).toBe(3)
  })

  it('extracts railways and flags bridge/tunnel roads', () => {
    expect(world.railways.length).toBe(1)
    expect(world.roads.find((r) => r.kind === 'motorway')?.bridge).toBe(true)
    expect(world.roads.find((r) => r.name === 'Main St')?.tunnel).toBe(true)
  })

  it('keeps the street name when present, omits it otherwise', () => {
    const named = world.roads.find((r) => r.name === 'Main St')
    expect(named).toBeDefined()
    const motorway = world.roads.find((r) => r.kind === 'motorway')!
    expect(motorway.name).toBeUndefined()
  })

  it('places geometry in local meters relative to center', () => {
    const road = world.roads[0]
    // node 1 is the center -> near origin
    const hasOrigin = road.points.some((p) => Math.abs(p.x) < 1 && Math.abs(p.z) < 1)
    expect(hasOrigin).toBe(true)
  })
})

describe('landmark POIs', () => {
  const world = parseOsm(
    {
      elements: [
        // a museum node, plus a second museum tagged on the same spot: one sight
        { type: 'node', id: 1, lat: 41.7151, lon: 44.8271, tags: { tourism: 'museum' } },
        { type: 'node', id: 2, lat: 41.7151, lon: 44.8271, tags: { tourism: 'museum' } },
        // a monument node, ~110m north — also a statue prop
        { type: 'node', id: 3, lat: 41.7161, lon: 44.8271, tags: { historic: 'monument' } },
        // a castle mapped as a way, off to the side
        { type: 'node', id: 10, lat: 41.7156, lon: 44.8286 },
        { type: 'node', id: 11, lat: 41.7157, lon: 44.8287 },
        { type: 'node', id: 12, lat: 41.7158, lon: 44.8286 },
        { type: 'way', id: 100, nodes: [10, 11, 12, 10], tags: { historic: 'castle' } },
      ],
    } as OverpassResponse,
    projector,
  )
  const landmarks = world.pois.filter((p) => p.kind === 'landmark')

  it('marks museums, monuments and castles (node or way) as landmarks', () => {
    // museum + monument + castle = 3; the duplicate museum is merged away
    expect(landmarks.length).toBe(3)
  })

  it('still raises a statue prop for the monument the beacon marks', () => {
    expect(world.props.some((p) => p.kind === 'statue')).toBe(true)
  })
})

describe('statues clear of trees', () => {
  const world = parseOsm(
    {
      elements: [
        // a monument (a statue prop) with a tree mapped ~1m over — through it
        { type: 'node', id: 1, lat: 41.7151, lon: 44.8271, tags: { historic: 'monument' } },
        { type: 'node', id: 2, lat: 41.71511, lon: 44.8271, tags: { natural: 'tree' } },
        // a second tree ~110m north, well clear of the statue
        { type: 'node', id: 3, lat: 41.7161, lon: 44.8271, tags: { natural: 'tree' } },
      ],
    } as OverpassResponse,
    projector,
  )
  const statue = world.props.find((p) => p.kind === 'statue')!

  it('keeps the statue itself — only the tree is cleared', () => {
    expect(statue).toBeDefined()
  })

  it('leaves no tree standing inside a statue', () => {
    for (const t of world.trees) {
      expect(Math.hypot(t.x - statue.at.x, t.z - statue.at.z)).toBeGreaterThan(2)
    }
  })

  it('drops only the overlapping tree, sparing the far one', () => {
    expect(world.trees.length).toBe(1)
  })
})
