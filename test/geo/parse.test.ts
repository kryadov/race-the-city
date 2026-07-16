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
