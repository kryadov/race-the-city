import { describe, it, expect } from 'vitest'
import { placeOf } from '../../src/app/rivals'

describe('placeOf', () => {
  const gate = { x: 100, z: 0 }

  it('puts whoever has taken more gates in front, however far back they are', () => {
    const you = { taken: 2, x: 0, z: 0 }
    const rivals = [{ taken: 1, x: 99, z: 0 }]
    expect(placeOf(you, rivals, gate)).toBe(1)
  })

  it('splits a tie on gates by who is nearer the next one', () => {
    const you = { taken: 1, x: 0, z: 0 }
    const rivals = [
      { taken: 1, x: 90, z: 0 },
      { taken: 1, x: 50, z: 0 },
    ]
    expect(placeOf(you, rivals, gate)).toBe(3)
  })

  it('is first place with the field behind on both counts', () => {
    const you = { taken: 3, x: 95, z: 0 }
    const rivals = [
      { taken: 3, x: 10, z: 0 },
      { taken: 2, x: 99, z: 0 },
    ]
    expect(placeOf(you, rivals, gate)).toBe(1)
  })

  it('ranks on gates alone once the course is done and there is no next gate', () => {
    const you = { taken: 6, x: 0, z: 0 }
    const rivals = [{ taken: 5, x: 0, z: 0 }]
    expect(placeOf(you, rivals, null)).toBe(1)
  })
})
