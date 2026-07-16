import { describe, it, expect } from 'vitest'
import { waterLevel } from '../../src/world/water'
import type { Vec2 } from '../../src/geo/types'

const v = (x: number, z: number): Vec2 => ({ x, z }) as Vec2

describe('waterLevel', () => {
  it('sits just above the lowest ground under the outline', () => {
    const ring = [v(0, 0), v(10, 0), v(10, 10), v(0, 10)]
    const provider = { heightAt: (x: number) => (x === 0 ? 5 : 9) }
    expect(waterLevel(ring, provider)).toBeCloseTo(5.2)
  })

  it('does not hang in the air when the centroid lands on a bank', () => {
    // A crescent river: the centroid (~15,15) is dry land 40m up, while the
    // water itself runs along the low outline. Levelling by centroid floated
    // the whole surface over the valley.
    const ring = [v(0, 0), v(30, 0), v(30, 30), v(20, 30), v(20, 10), v(0, 10)]
    const provider = {
      heightAt: (x: number, z: number) => (x > 14 && x < 21 && z > 12 && z < 25 ? 40 : 2),
    }
    const level = waterLevel(ring, provider)
    expect(level).toBeCloseTo(2.2)
    expect(level).toBeLessThan(40)
  })

  it('follows the basin down as the terrain drops', () => {
    const ring = [v(0, 0), v(10, 0), v(10, 10)]
    const high = { heightAt: () => 100 }
    const low = { heightAt: () => -3 }
    expect(waterLevel(ring, high)).toBeCloseTo(100.2)
    expect(waterLevel(ring, low)).toBeCloseTo(-2.8)
  })
})
