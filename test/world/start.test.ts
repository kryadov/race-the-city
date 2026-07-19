import { describe, it, expect } from 'vitest'
import { startPose } from '../../src/world/start'
import type { Road, Vec2 } from '../../src/geo/types'

const v = (x: number, z: number): Vec2 => ({ x, z })

describe('startPose', () => {
  it('puts you on the road, not on the exact spot the geocoder named', () => {
    // Tokyo's centre is a building. You began inside it, wedged against a wall.
    const roads: Road[] = [{ kind: 'residential', points: [v(30, 40), v(30, 200)] }]
    const p = startPose(roads)
    expect(p).not.toBeNull()
    expect(Math.hypot(p!.x - 30, p!.z - 40), 'should be on the nearest road vertex').toBeLessThan(1)
  })

  it('faces along the road rather than into the kerb', () => {
    const roads: Road[] = [{ kind: 'residential', points: [v(0, 10), v(100, 10)] }]
    const p = startPose(roads)!
    // The road runs toward +x, and heading 0 faces +x.
    expect(Math.abs(p.heading)).toBeLessThan(0.01)
  })

  it('takes the nearest of several roads', () => {
    const roads: Road[] = [
      { kind: 'residential', points: [v(500, 500), v(600, 500)] },
      { kind: 'residential', points: [v(12, 8), v(12, 90)] },
    ]
    const p = startPose(roads)!
    expect(p.x).toBeCloseTo(12)
    expect(p.z).toBeCloseTo(8)
  })

  it('ignores a road you have no business starting on', () => {
    const roads: Road[] = [
      { kind: 'path', points: [v(1, 1), v(1, 50)] },
      { kind: 'residential', points: [v(80, 0), v(200, 0)] },
    ]
    const p = startPose(roads)!
    expect(p.x, 'a footpath is not a starting grid').toBeCloseTo(80)
  })

  it('leaves a tunnel alone: it is not modelled, so it is inside a building', () => {
    const roads: Road[] = [
      { kind: 'residential', points: [v(2, 2), v(2, 60)], tunnel: true },
      { kind: 'residential', points: [v(90, 0), v(180, 0)] },
    ]
    expect(startPose(roads)!.x).toBeCloseTo(90)
  })

  it('has nothing to say when there are no roads at all', () => {
    expect(startPose([])).toBeNull()
  })

  // Axis-aligned box footprint, and whether a point sits in it — enough to state
  // "a building is right there" without leaning on the module under test.
  const box = (x0: number, z0: number, x1: number, z1: number): Vec2[] => [
    v(x0, z0), v(x1, z0), v(x1, z1), v(x0, z1),
  ]
  const inBox = (x: number, z: number, x0: number, z0: number, x1: number, z1: number): boolean =>
    x >= x0 && x <= x1 && z >= z0 && z <= z1

  it('turns away from a wall dead ahead of the nearest vertex', () => {
    // Road runs +x from the centre; the along-road heading there is 0 (faces +x)
    // — straight into a building a few metres up the street. The old code took
    // that heading and put you nose-to-the-masonry.
    const roads: Road[] = [{ kind: 'residential', points: [v(0, 0), v(50, 0)] }]
    const buildings: Vec2[][] = [box(2, -4, 12, 4)] // sits at +x, ahead of heading 0
    const p = startPose(roads, buildings)!
    // A few metres in front of where we end up must be open ground, not the wall.
    const ax = p.x + Math.cos(p.heading) * 4
    const az = p.z + Math.sin(p.heading) * 4
    expect(inBox(ax, az, 2, -4, 12, 4), 'must not spawn facing the building').toBe(false)
  })

  it('rolls off a vertex boxed in on every side to a clear one down the road', () => {
    // The nearest vertex sits INSIDE a building — walls ahead and behind, so no
    // heading saves it; a clear vertex waits further along the same road.
    const roads: Road[] = [{ kind: 'residential', points: [v(0, 0), v(60, 0)] }]
    const buildings: Vec2[][] = [box(-8, -8, 8, 8)] // straddles the (0,0) vertex
    const p = startPose(roads, buildings)!
    // We must have left the building the old nearest-vertex pick dropped us in.
    expect(inBox(p.x, p.z, -8, -8, 8, 8), 'must not spawn inside the building').toBe(false)
  })

  it('keeps its natural heading when nothing is in the way', () => {
    // With buildings to consider but none nearby, it still faces along the road.
    const roads: Road[] = [{ kind: 'residential', points: [v(0, 10), v(100, 10)] }]
    const buildings: Vec2[][] = [box(400, 400, 420, 420)] // far off, irrelevant
    const p = startPose(roads, buildings)!
    expect(Math.abs(p.heading)).toBeLessThan(0.01)
    expect(p.x).toBeCloseTo(0)
    expect(p.z).toBeCloseTo(10)
  })
})
