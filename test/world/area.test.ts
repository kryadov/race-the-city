import { describe, it, expect } from 'vitest'
import { ringArea, inradius } from '../../src/world/area'
import type { Vec2 } from '../../src/geo/types'

const v = (x: number, z: number): Vec2 => ({ x, z })
const square = (s: number): Vec2[] => [v(0, 0), v(s, 0), v(s, s), v(0, s)]

describe('ringArea', () => {
  it('measures a square', () => {
    expect(Math.abs(ringArea(square(10)))).toBeCloseTo(100)
    expect(Math.abs(ringArea(square(40)))).toBeCloseTo(1600)
  })

  it('gives the same size whichever way the ring is wound', () => {
    const cw = square(10)
    const ccw = [...cw].reverse()
    expect(Math.abs(ringArea(cw))).toBeCloseTo(Math.abs(ringArea(ccw)))
  })
})

describe('inradius', () => {
  it('finds the room in a square', () => {
    // it samples a grid, so it lands near the middle rather than exactly on it
    const fit = inradius(square(100))
    expect(fit.r).toBeGreaterThan(40) // half of 100, near enough
    expect(fit.r).toBeLessThanOrEqual(50)
    expect(Math.abs(fit.x - 50)).toBeLessThan(5)
    expect(Math.abs(fit.z - 50)).toBeLessThan(5)
  })

  it('is not fooled by area on a long thin strip', () => {
    // The whole point: this canal has 20,000m² and 20m of width. Area alone
    // would sail a ship up it.
    const canal: Vec2[] = [v(0, 0), v(1000, 0), v(1000, 20), v(0, 20)]
    expect(Math.abs(ringArea(canal))).toBe(20000)
    expect(inradius(canal).r, 'a ship needs room, not acreage').toBeLessThan(12)
  })

  it('puts the point it finds inside the shape', () => {
    const L: Vec2[] = [v(0, 0), v(100, 0), v(100, 30), v(30, 30), v(30, 100), v(0, 100)]
    const fit = inradius(L)
    expect(fit.r).toBeGreaterThan(5)
    // the notch at (60,60) is outside the L; the fit must not land there
    expect(fit.x < 30 || fit.z < 30).toBe(true)
  })

  it('reports next to no room in a sliver', () => {
    expect(inradius([v(0, 0), v(50, 0), v(50, 1), v(0, 1)]).r).toBeLessThan(1)
  })
})

describe('circleFits', () => {
  it('accepts a boat that stays in the water', async () => {
    const { circleFits } = await import('../../src/app/boats')
    const lake = square(200)
    // a small boat circling the middle of a big lake
    expect(circleFits(lake, 100, 100, 40, 3)).toBe(true)
  })

  it('rejects one whose hull would swing onto the bank', () => {
    // this is the check that matters: the centre is in the water and the ends
    // are not, which is a ship in a field
    return import('../../src/app/boats').then(({ circleFits }) => {
      const pond = square(60)
      expect(circleFits(pond, 30, 30, 25, 19)).toBe(false)
    })
  })

  it('rejects a circle whose centre is outside the shape entirely', () => {
    return import('../../src/app/boats').then(({ circleFits }) => {
      expect(circleFits(square(50), 500, 500, 5, 2)).toBe(false)
    })
  })
})

/** Flat ground at sea level: everything inside an outline is genuinely wet. */
const sea_level_flat = { heightAt: () => 0 }

describe('where a boat goes', () => {
  /** A sea filling everything east of x = 200, running well off the map. */
  const sea: Vec2[] = [
    { x: 200, z: -6000 },
    { x: 6000, z: -6000 },
    { x: 6000, z: 6000 },
    { x: 200, z: 6000 },
  ]

  it('puts a ship where you could drive to it, not out in the open sea', async () => {
    // The widest part of a sea that runs past the map is a mile offshore. The
    // ship was out there: afloat, correct, and nowhere you can reach.
    const { spotNearMiddle } = await import('../../src/app/boats')
    const spot = spotNearMiddle(sea, sea_level_flat, 0)
    expect(spot).not.toBeNull()
    expect(Math.max(Math.abs(spot!.x), Math.abs(spot!.z)), 'off the map is nowhere').toBeLessThanOrEqual(1000)
    expect(spot!.r).toBeGreaterThan(14)
  })

  it('takes the widest water in sight, not the first damp spot by the bank', async () => {
    // Nearest-with-any-room is always hard against the near shore, where only a
    // rowboat fits — so a lake with room for a ship in the middle of it got a
    // dinghy at the water's edge.
    const { spotNearMiddle } = await import('../../src/app/boats')
    const lake: Vec2[] = [
      { x: -400, z: -400 },
      { x: 400, z: -400 },
      { x: 400, z: 400 },
      { x: -400, z: 400 },
    ]
    const spot = spotNearMiddle(lake, sea_level_flat, 0)!
    expect(spot.r, 'should find the middle of a 800m lake, not its rim').toBeGreaterThan(300)
  })

  it('still finds nothing in a puddle', async () => {
    const { spotNearMiddle } = await import('../../src/app/boats')
    const puddle: Vec2[] = [
      { x: 0, z: 0 },
      { x: 8, z: 0 },
      { x: 8, z: 8 },
      { x: 0, z: 8 },
    ]
    expect(spotNearMiddle(puddle, sea_level_flat, 0)).toBeNull()
  })
})

describe('a lake with a ship on it', () => {
  it('always puts one on the first water big enough, whatever the dice say', async () => {
    // A city usually has one river or one lake. Rolling for it meant the water
    // was simply empty — repeatedly, and that is exactly what it looked like.
    const THREE = await import('three')
    const { createBoats } = await import('../../src/app/boats')
    const lake: Vec2[] = [
      { x: -400, z: -400 },
      { x: 400, z: -400 },
      { x: 400, z: 400 },
      { x: -400, z: 400 },
    ]
    const scene = new THREE.Scene()
    // rand() = 0.99: every random gate in the module says no.
    createBoats(scene, [lake], { heightAt: () => 0 }, () => 0.99, 4)
    expect((scene.children[0] as InstanceType<typeof THREE.Group>).children.length).toBeGreaterThan(0)
  })
})

describe('water that is not there', () => {
  it('puts no ship on a lake whose middle stands above the water', async () => {
    // The water sits at the LOWEST ground around its rim, so a lake mapped over
    // a valley in the DEM can have terrain in the middle standing above that
    // plane. The water is buried under the hill; the ship sailed over the grass
    // on top of it.
    const { spotNearMiddle } = await import('../../src/app/boats')
    const lake: Vec2[] = [
      { x: -150, z: -150 },
      { x: 150, z: -150 },
      { x: 150, z: 150 },
      { x: -150, z: 150 },
    ]
    // Ground standing above the water plane across the whole of it: only the
    // corners dip under, and no boat fits in a corner.
    const hilly = { heightAt: (x: number, z: number) => 20 - Math.hypot(x, z) / 10 }
    expect(spotNearMiddle(lake, hilly, 0)).toBeNull()
  })

  it('still floats one on the part that is under water', async () => {
    const { spotNearMiddle } = await import('../../src/app/boats')
    const lake: Vec2[] = [
      { x: -600, z: -600 },
      { x: 600, z: -600 },
      { x: 600, z: 600 },
      { x: -600, z: 600 },
    ]
    // Dry in the east, wet in the west.
    const half = { heightAt: (x: number) => (x > 0 ? 5 : -3) }
    const spot = spotNearMiddle(lake, half, 0)!
    expect(spot.x, 'it should be on the wet side').toBeLessThanOrEqual(0)
  })
})

describe('a lake out at the edge of the map', () => {
  it('gets a boat: you can drive there, so it is not out of sight', async () => {
    // The search was a 900m circle round the city centre, on the grounds that
    // the fog closes at 900m. The fog hides what is far from the CAMERA, and the
    // camera goes where you drive — to the map's corners, 1414m out. Two big
    // lakes near the edge came up empty.
    const { spotNearMiddle } = await import('../../src/app/boats')
    const corner: Vec2[] = [
      { x: 600, z: 600 },
      { x: 980, z: 600 },
      { x: 980, z: 980 },
      { x: 600, z: 980 },
    ]
    const spot = spotNearMiddle(corner, { heightAt: () => -1 }, 0)
    expect(spot, 'a lake at the edge of the map is still on the map').not.toBeNull()
    expect(spot!.r).toBeGreaterThan(14)
  })

  it('still ignores open water that runs off the map entirely', async () => {
    const { spotNearMiddle } = await import('../../src/app/boats')
    const offMap: Vec2[] = [
      { x: 3000, z: -6000 },
      { x: 9000, z: -6000 },
      { x: 9000, z: 6000 },
      { x: 3000, z: 6000 },
    ]
    expect(spotNearMiddle(offMap, { heightAt: () => -1 }, 0)).toBeNull()
  })
})
