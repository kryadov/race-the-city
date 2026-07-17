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
})
