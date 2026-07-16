import { describe, it, expect } from 'vitest'
import { variantsFor } from '../../src/world/greenery'

const names = (lat: number): string[] => variantsFor(lat).map((v) => v.name)
const hasPalm = (lat: number): boolean => names(lat).includes('palm')

describe('variantsFor', () => {
  it('grows palms in the tropics and subtropics', () => {
    for (const lat of [0, 12.9, 25.2, 35.7]) expect(hasPalm(lat), `${lat}`).toBe(true)
  })

  it('grows no palms up north', () => {
    for (const lat of [55.75, 59.94, 64.1]) expect(hasPalm(lat), `${lat}`).toBe(false)
  })

  it('mixes them on the Mediterranean', () => {
    // Monaco, 43.7N — the city that prompted this: conifers there read as wrong,
    // but so would nothing but palms.
    const monaco = names(43.73)
    expect(monaco).toContain('palm')
    expect(monaco.some((n) => n !== 'palm')).toBe(true)
  })

  it('treats the southern hemisphere the same', () => {
    expect(hasPalm(-23.5)).toBe(true) // Rio
    expect(hasPalm(-54.8)).toBe(false) // Ushuaia
  })

  it('always offers something to plant', () => {
    for (let lat = -90; lat <= 90; lat += 3) expect(variantsFor(lat).length).toBeGreaterThan(0)
  })

  it('gives palms their own tall trunk, and leaves the others sharing one', () => {
    const palm = variantsFor(10).find((v) => v.name === 'palm')!
    expect(palm.trunk, 'a palm on a stubby 2m trunk is a shrub').toBeDefined()
    const conifer = variantsFor(60).find((v) => v.name === 'conifer')!
    expect(conifer.trunk).toBeUndefined()
  })
})
