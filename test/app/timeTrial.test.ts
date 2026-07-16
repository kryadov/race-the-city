import { describe, it, expect } from 'vitest'
import { pickCourse, formatLap } from '../../src/app/timeTrial'
import type { Road, Vec2 } from '../../src/geo/types'

const v = (x: number, z: number): Vec2 => ({ x, z })
const grid: Road[] = []
for (let i = -4; i <= 4; i++) {
  grid.push({ points: [v(-1000, i * 250), v(0, i * 250), v(1000, i * 250)], kind: 'residential' })
  grid.push({ points: [v(i * 250, -1000), v(i * 250, 0), v(i * 250, 1000)], kind: 'residential' })
}

describe('formatLap', () => {
  it('reads as a lap time at a glance', () => {
    expect(formatLap(0)).toBe('0:00.0')
    expect(formatLap(9.4)).toBe('0:09.4')
    expect(formatLap(65.25)).toBe('1:05.3')
    expect(formatLap(600)).toBe('10:00.0')
  })
})

describe('pickCourse', () => {
  it('lays out a course', () => {
    expect(pickCourse(grid, v(0, 0), 6, Math.random).length).toBeGreaterThan(1)
  })

  it('spaces the gates out, so a lap is a drive rather than a formality', () => {
    const course = pickCourse(grid, v(0, 0), 6, Math.random)
    for (let i = 0; i < course.length; i++) {
      for (let j = i + 1; j < course.length; j++) {
        const d = Math.hypot(course[i].x - course[j].x, course[i].z - course[j].z)
        expect(d, 'two gates on top of each other are one gate').toBeGreaterThan(100)
      }
    }
  })

  it('never puts the first gate on the start line', () => {
    const course = pickCourse(grid, v(0, 0), 6, Math.random)
    for (const c of course) expect(Math.hypot(c.x, c.z)).toBeGreaterThan(50)
  })

  it('puts gates on roads you can actually drive', () => {
    // every gate must be a vertex of a driveable road, not a point in a field
    const onRoad = grid.filter((r) => r.kind !== 'path').flatMap((r) => r.points)
    for (const c of pickCourse(grid, v(0, 0), 6, Math.random)) {
      expect(onRoad.some((p) => p.x === c.x && p.z === c.z)).toBe(true)
    }
  })

  it('gives up quietly on a city with no roads', () => {
    expect(pickCourse([], v(0, 0))).toEqual([])
    expect(pickCourse([{ points: [v(0, 0), v(1, 0)], kind: 'path' }], v(0, 0))).toEqual([])
  })
})
