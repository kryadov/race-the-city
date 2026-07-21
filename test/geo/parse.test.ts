import { describe, it, expect } from 'vitest'
import fixture from '../fixtures/overpass-small.json'
import { parseOsm, classifyRoad, buildingHeight, classifySurface, isPitch, pitchSport, hasCycleLane, isPedestrianArea, type OverpassResponse } from '../../src/geo/parse'
import { Projector } from '../../src/geo/project'
import { pointInPolygon } from '../../src/physics/collide'

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

describe('wooded areas', () => {
  const world = parseOsm(
    {
      elements: [
        // a wood mapped as a closed way
        { type: 'node', id: 1, lat: 41.7151, lon: 44.8271 },
        { type: 'node', id: 2, lat: 41.7151, lon: 44.8281 },
        { type: 'node', id: 3, lat: 41.7161, lon: 44.8281 },
        { type: 'node', id: 4, lat: 41.7161, lon: 44.8271 },
        { type: 'way', id: 100, nodes: [1, 2, 3, 4, 1], tags: { natural: 'wood' } },
        // a forest mapped as a multipolygon relation (outer ring on an untagged way)
        { type: 'node', id: 11, lat: 41.7141, lon: 44.8251 },
        { type: 'node', id: 12, lat: 41.7141, lon: 44.8261 },
        { type: 'node', id: 13, lat: 41.7146, lon: 44.8261 },
        { type: 'node', id: 14, lat: 41.7146, lon: 44.8251 },
        { type: 'way', id: 200, nodes: [11, 12, 13, 14, 11] },
        { type: 'relation', id: 300, members: [{ type: 'way', ref: 200, role: 'outer' }], tags: { landuse: 'forest' } },
      ],
    } as OverpassResponse,
    projector,
  )

  it('extracts wooded polygons from both ways and relations', () => {
    expect(world.forests.length).toBe(2)
    for (const ring of world.forests) expect(ring.length).toBeGreaterThanOrEqual(3)
  })

  it('keeps woods in green too, so the ground still tints under them', () => {
    // both the way-wood and the relation-forest carry through to green
    expect(world.green.length).toBeGreaterThanOrEqual(2)
    for (const ring of world.forests) expect(world.green).toContain(ring)
  })
})

describe('isPedestrianArea', () => {
  it('paves a plaza — a closed pedestrian way, or one tagged area=yes', () => {
    expect(isPedestrianArea({ highway: 'pedestrian' }, true)).toBe(true)
    expect(isPedestrianArea({ highway: 'pedestrian', area: 'yes' }, false)).toBe(true)
  })
  it('leaves a pedestrian STREET as a line', () => {
    expect(isPedestrianArea({ highway: 'pedestrian' }, false)).toBe(false) // open way
    expect(isPedestrianArea({ highway: 'pedestrian', area: 'no' }, true)).toBe(false) // explicit no
  })
  it('ignores anything that is not a pedestrian way', () => {
    expect(isPedestrianArea({ highway: 'residential' }, true)).toBe(false)
    expect(isPedestrianArea({ highway: 'footway' }, true)).toBe(false)
    expect(isPedestrianArea({}, true)).toBe(false)
  })
})

describe('parseOsm — pedestrian plazas', () => {
  const world = parseOsm(
    {
      elements: [
        // A closed highway=pedestrian way — a plaza. Should pave, not become a road.
        { type: 'node', id: 41, lat: 41.7151, lon: 44.8271 },
        { type: 'node', id: 42, lat: 41.7151, lon: 44.8276 },
        { type: 'node', id: 43, lat: 41.7156, lon: 44.8276 },
        { type: 'node', id: 44, lat: 41.7156, lon: 44.8271 },
        { type: 'way', id: 401, nodes: [41, 42, 43, 44, 41], tags: { highway: 'pedestrian' } },
        // An OPEN highway=pedestrian way — a pedestrian street. Stays a road line.
        { type: 'node', id: 45, lat: 41.7161, lon: 44.8271 },
        { type: 'node', id: 46, lat: 41.7161, lon: 44.8281 },
        { type: 'way', id: 402, nodes: [45, 46], tags: { highway: 'pedestrian' } },
      ],
    } as OverpassResponse,
    projector,
  )

  it('paves the closed plaza as a surface', () => {
    const paved = world.surfaces.filter((s) => s.kind === 'paved')
    expect(paved.length).toBe(1)
    expect(paved[0].ring.length).toBeGreaterThanOrEqual(3)
  })

  it('does not turn the plaza into a road, but keeps the pedestrian street as one', () => {
    // Only the open pedestrian street (way 402) is a road; the plaza is paved ground.
    expect(world.roads.length).toBe(1)
    expect(world.roads[0].kind).toBe('path')
  })
})

describe('parseOsm — water islands (inner rings)', () => {
  const world = parseOsm(
    {
      elements: [
        // A lake as a multipolygon: a big outer ring with a small island (inner ring) in it.
        { type: 'node', id: 21, lat: 41.710, lon: 44.820 },
        { type: 'node', id: 22, lat: 41.710, lon: 44.830 },
        { type: 'node', id: 23, lat: 41.720, lon: 44.830 },
        { type: 'node', id: 24, lat: 41.720, lon: 44.820 },
        { type: 'way', id: 201, nodes: [21, 22, 23, 24, 21] },
        { type: 'node', id: 25, lat: 41.713, lon: 44.824 },
        { type: 'node', id: 26, lat: 41.713, lon: 44.826 },
        { type: 'node', id: 27, lat: 41.717, lon: 44.826 },
        { type: 'node', id: 28, lat: 41.717, lon: 44.824 },
        { type: 'way', id: 202, nodes: [25, 26, 27, 28, 25] },
        {
          type: 'relation',
          id: 301,
          members: [
            { type: 'way', ref: 201, role: 'outer' },
            { type: 'way', ref: 202, role: 'inner' },
          ],
          tags: { natural: 'water', type: 'multipolygon' },
        },
      ],
    } as OverpassResponse,
    projector,
  )

  it('takes the outer ring as water', () => {
    expect(world.water.length).toBe(1)
    expect(world.water[0].length).toBeGreaterThanOrEqual(3)
  })

  it('carries the inner ring as a water hole (the island)', () => {
    expect(world.waterHoles.length).toBe(1)
    expect(world.waterHoles[0].length).toBeGreaterThanOrEqual(3)
    // The island sits inside the lake's outer ring.
    const c = world.waterHoles[0].reduce((a, p) => ({ x: a.x + p.x / world.waterHoles[0].length, z: a.z + p.z / world.waterHoles[0].length }), { x: 0, z: 0 })
    expect(pointInPolygon(c.x, c.z, world.water[0])).toBe(true)
  })
})

describe('classifySurface', () => {
  it('maps cropland tags to farmland', () => {
    expect(classifySurface({ landuse: 'farmland' })).toBe('farmland')
    expect(classifySurface({ landuse: 'farmyard' })).toBe('farmland')
  })
  it('maps meadow and rough grass to meadow', () => {
    expect(classifySurface({ landuse: 'meadow' })).toBe('meadow')
    expect(classifySurface({ natural: 'grassland' })).toBe('meadow')
    expect(classifySurface({ natural: 'heath' })).toBe('meadow')
  })
  it('maps orchards, vineyards and scrub to orchard', () => {
    expect(classifySurface({ landuse: 'orchard' })).toBe('orchard')
    expect(classifySurface({ landuse: 'vineyard' })).toBe('orchard')
    expect(classifySurface({ natural: 'scrub' })).toBe('orchard')
  })
  it('maps built-up land (residential/commercial/industrial) to residential', () => {
    expect(classifySurface({ landuse: 'residential' })).toBe('residential')
    expect(classifySurface({ landuse: 'commercial' })).toBe('residential')
    expect(classifySurface({ landuse: 'industrial' })).toBe('residential')
  })
  it('prefers the landuse tag over a natural cover', () => {
    expect(classifySurface({ landuse: 'residential', natural: 'scrub' })).toBe('residential')
  })
  it('returns null for water, forest, parks and untagged areas', () => {
    expect(classifySurface({ landuse: 'forest' })).toBeNull()
    expect(classifySurface({ leisure: 'park' })).toBeNull()
    expect(classifySurface({ natural: 'water' })).toBeNull()
    expect(classifySurface({})).toBeNull()
  })
})

describe('land-use surfaces', () => {
  // One small non-overlapping closed square per land-use area. idBase spaces the
  // node ids apart; latStep pushes each square north so none touch.
  function square(idBase: number, step: number, tags: Record<string, string>) {
    const lat = 41.72 + step * 0.002
    const lon = 44.83
    const d = 0.0005
    return [
      { type: 'node', id: idBase + 1, lat, lon },
      { type: 'node', id: idBase + 2, lat, lon: lon + d },
      { type: 'node', id: idBase + 3, lat: lat + d, lon: lon + d },
      { type: 'node', id: idBase + 4, lat: lat + d, lon },
      { type: 'way', id: idBase, nodes: [idBase + 1, idBase + 2, idBase + 3, idBase + 4, idBase + 1], tags },
    ]
  }
  const world = parseOsm(
    {
      elements: [
        ...square(100, 0, { landuse: 'farmland' }),
        ...square(110, 1, { landuse: 'meadow' }),
        ...square(120, 2, { landuse: 'orchard' }),
        ...square(130, 3, { landuse: 'residential' }),
        ...square(140, 4, { natural: 'grassland' }),
        ...square(150, 5, { natural: 'scrub' }),
        ...square(160, 6, { landuse: 'commercial' }),
        ...square(170, 7, { landuse: 'vineyard' }),
      ],
    } as OverpassResponse,
    projector,
  )

  it('collects each land-use area as a typed surface polygon', () => {
    expect(world.surfaces.length).toBe(8)
    const count = (k: string): number => world.surfaces.filter((s) => s.kind === k).length
    expect(count('farmland')).toBe(1)
    expect(count('meadow')).toBe(2) // landuse=meadow + natural=grassland
    expect(count('orchard')).toBe(3) // landuse=orchard + natural=scrub + landuse=vineyard
    expect(count('residential')).toBe(2) // landuse=residential + landuse=commercial
  })

  it('keeps every surface ring closed-and-usable (>=3 pts)', () => {
    for (const s of world.surfaces) expect(s.ring.length).toBeGreaterThanOrEqual(3)
  })

  it('still files farmland and meadow as grazing fields and greenery', () => {
    // The tint is additive: farmland/meadow/orchard remain fields (livestock) and
    // green (tint + tree scatter), so nothing that depended on them regresses.
    expect(world.fields.length).toBeGreaterThanOrEqual(2)
    expect(world.green.length).toBeGreaterThanOrEqual(2)
  })
})

describe('pitch classification', () => {
  it('recognises a leisure=pitch way', () => {
    expect(isPitch({ leisure: 'pitch' })).toBe(true)
    expect(isPitch({ leisure: 'park' })).toBe(false)
    expect(isPitch({})).toBe(false)
  })

  it('reads the sport, defaulting unknown/absent to generic', () => {
    expect(pitchSport({ sport: 'soccer' })).toBe('soccer')
    expect(pitchSport({ sport: 'football' })).toBe('soccer')
    expect(pitchSport({ sport: 'basketball' })).toBe('basketball')
    expect(pitchSport({ sport: 'tennis' })).toBe('tennis')
    expect(pitchSport({ sport: 'soccer;basketball' })).toBe('soccer') // first listed
    expect(pitchSport({ sport: 'petanque' })).toBe('generic')
    expect(pitchSport({})).toBe('generic')
  })
})

describe('sports pitches', () => {
  const world = parseOsm(
    {
      elements: [
        // a soccer pitch as a closed way
        { type: 'node', id: 1, lat: 41.7151, lon: 44.8271 },
        { type: 'node', id: 2, lat: 41.7151, lon: 44.8281 },
        { type: 'node', id: 3, lat: 41.7156, lon: 44.8281 },
        { type: 'node', id: 4, lat: 41.7156, lon: 44.8271 },
        { type: 'way', id: 100, nodes: [1, 2, 3, 4, 1], tags: { leisure: 'pitch', sport: 'soccer' } },
        // a pitch with no sport → generic
        { type: 'node', id: 11, lat: 41.7161, lon: 44.8291 },
        { type: 'node', id: 12, lat: 41.7161, lon: 44.8296 },
        { type: 'node', id: 13, lat: 41.7164, lon: 44.8296 },
        { type: 'node', id: 14, lat: 41.7164, lon: 44.8291 },
        { type: 'way', id: 200, nodes: [11, 12, 13, 14, 11], tags: { leisure: 'pitch' } },
      ],
    } as OverpassResponse,
    projector,
  )

  it('collects each pitch as a typed closed ring', () => {
    expect(world.pitches.length).toBe(2)
    for (const p of world.pitches) expect(p.ring.length).toBeGreaterThanOrEqual(3)
  })

  it('carries the sport through, defaulting to generic', () => {
    expect(world.pitches.some((p) => p.sport === 'soccer')).toBe(true)
    expect(world.pitches.some((p) => p.sport === 'generic')).toBe(true)
  })

  it('does not file a pitch as green/park or a building', () => {
    // A pitch is neither a park lawn nor a footprint — it has its own layer.
    expect(world.green.length).toBe(0)
    expect(world.buildings.length).toBe(0)
  })
})

describe('cycle-lane detection', () => {
  it('flags a dedicated cycleway and a road carrying a cycleway tag', () => {
    expect(hasCycleLane({ highway: 'cycleway' })).toBe(true)
    expect(hasCycleLane({ highway: 'residential', cycleway: 'lane' })).toBe(true)
    expect(hasCycleLane({ highway: 'primary', cycleway: 'track' })).toBe(true)
    expect(hasCycleLane({ highway: 'residential', 'cycleway:right': 'lane' })).toBe(true)
  })

  it('does not flag a plain road, or one whose cyclists are separate/none', () => {
    expect(hasCycleLane({ highway: 'residential' })).toBe(false)
    expect(hasCycleLane({ highway: 'residential', cycleway: 'no' })).toBe(false)
    expect(hasCycleLane({ highway: 'primary', cycleway: 'separate' })).toBe(false)
  })

  it('sets Road.cycleway on the parsed road, and leaves plain roads unflagged', () => {
    const world = parseOsm(
      {
        elements: [
          { type: 'node', id: 1, lat: 41.7151, lon: 44.8271 },
          { type: 'node', id: 2, lat: 41.7156, lon: 44.8281 },
          { type: 'way', id: 100, nodes: [1, 2], tags: { highway: 'residential', cycleway: 'lane' } },
          { type: 'node', id: 3, lat: 41.7161, lon: 44.8291 },
          { type: 'node', id: 4, lat: 41.7166, lon: 44.8301 },
          { type: 'way', id: 200, nodes: [3, 4], tags: { highway: 'residential' } },
        ],
      } as OverpassResponse,
      projector,
    )
    const withLane = world.roads.find((r) => r.cycleway)
    expect(withLane).toBeDefined()
    expect(world.roads.filter((r) => r.cycleway).length).toBe(1)
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
