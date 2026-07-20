import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  createNitro,
  corridorSpots,
  CORRIDOR_SPACING,
  CORRIDOR_MIN_APART,
  NEAR_MIN,
  NEAR_MAX,
  FAR,
  APART,
  NITRO_TYPES,
  nitroTypeFor,
} from '../../src/app/nitro'
import type { Road, Vec2 } from '../../src/geo/types'

/** A straight road along the x-axis, densified to `step`-metre vertices like OSM. */
function straightRoad(x0: number, x1: number, step: number, kind: Road['kind']): Road {
  const points: Vec2[] = []
  for (let x = x0; x <= x1; x += step) points.push({ x, z: 0 })
  if (points[points.length - 1].x !== x1) points.push({ x: x1, z: 0 })
  return { points, kind }
}

const closestPair = (pts: Vec2[]): number => {
  let closest = Infinity
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++)
      closest = Math.min(closest, Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z))
  return closest
}

const flat = { heightAt: () => 0 }

/** Road vertices spread over a ~1000m-radius city, like a real OSM network. */
function citySpots(): Vec2[] {
  const spots: Vec2[] = []
  for (let i = 0; i < 4000; i++) {
    const a = (i / 4000) * Math.PI * 2 * 7
    const r = 20 + (i % 980)
    spots.push({ x: Math.cos(a) * r, z: Math.sin(a) * r } as Vec2)
  }
  return spots
}

function bottles(scene: THREE.Scene): THREE.Object3D[] {
  return (scene.children[0] as THREE.Group).children
}

const distTo = (o: THREE.Object3D, x: number, z: number): number =>
  Math.hypot(o.position.x - x, o.position.z - z)

describe('nitro', () => {
  it('scatters every bottle in the ring around the car, not across the whole city', () => {
    const scene = new THREE.Scene()
    const nitro = createNitro(scene)
    nitro.setSpots(citySpots(), flat, 300, -200)

    const active = bottles(scene).filter((b) => b.visible)
    expect(active.length).toBeGreaterThan(0)
    for (const b of active) {
      const d = distTo(b, 300, -200)
      expect(d).toBeGreaterThanOrEqual(NEAR_MIN - 1)
      expect(d).toBeLessThanOrEqual(NEAR_MAX + 1)
    }
  })

  it('respawns a collected bottle near the car rather than anywhere in the city', () => {
    const scene = new THREE.Scene()
    const nitro = createNitro(scene)
    nitro.setSpots(citySpots(), flat, 0, 0)

    // drive onto the nearest bottle to collect it — update now reports its nitro type
    const target = bottles(scene).find((b) => b.visible)!
    const got = nitro.update(target.position.x, target.position.z, 0.016)
    expect(got).not.toBeNull()
    expect(NITRO_TYPES).toContain(got!)
    expect(target.visible).toBe(false)

    // wait out the respawn timer while the car sits at a new spot
    for (let i = 0; i < 800; i++) nitro.update(500, 500, 0.016)
    expect(target.visible).toBe(true)
    expect(distTo(target, 500, 500)).toBeLessThanOrEqual(NEAR_MAX + 1)
  })

  it('recycles bottles left far behind so the field follows the car', () => {
    const scene = new THREE.Scene()
    const nitro = createNitro(scene)
    nitro.setSpots(citySpots(), flat, 0, 0)

    // drive far away from where the bottles were placed
    nitro.update(-800, 600, 0.016)
    for (const b of bottles(scene).filter((o) => o.visible)) {
      expect(distTo(b, -800, 600)).toBeLessThanOrEqual(FAR)
    }
  })

  it('falls back to any spot when the ring around the car is empty', () => {
    const scene = new THREE.Scene()
    const nitro = createNitro(scene)
    // a single cluster of spots, with the car nowhere near it
    const spots: Vec2[] = [{ x: 0, z: 0 } as Vec2, { x: 5, z: 5 } as Vec2]
    nitro.setSpots(spots, flat, 5000, 5000)
    expect(bottles(scene).filter((b) => b.visible).length).toBeGreaterThan(0)
  })

  it('hides everything when there are no spots at all', () => {
    const scene = new THREE.Scene()
    const nitro = createNitro(scene)
    nitro.setSpots([], flat, 0, 0)
    expect(bottles(scene).filter((b) => b.visible).length).toBe(0)
  })
})

describe('bottles keep their distance', () => {
  it('does not drop two of them on top of each other', () => {
    // Four bottles filled one view, two of them touching: a spot was drawn from
    // the road's vertices with nothing said about where the others had gone.
    const scene = new THREE.Scene()
    const n = createNitro(scene)
    n.setSpots(citySpots(), flat, 0, 0)
    const out = (scene.children[0] as THREE.Group).children.filter((c) => c.visible)
    let closest = Infinity
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        closest = Math.min(closest, out[i].position.distanceTo(out[j].position))
      }
    }
    expect(out.length, 'nothing was placed at all').toBeGreaterThan(1)
    expect(closest, 'two bottles are standing in the same spot').toBeGreaterThanOrEqual(APART - 0.01)
  })

  it('keeps them apart even where it cannot keep them far apart', () => {
    // A cramped network: nowhere is APART clear, but nothing may share a spot.
    const cramped: Vec2[] = Array.from({ length: 60 }, (_, i) => ({ x: 60 + i * 3, z: 0 }))
    const scene = new THREE.Scene()
    const n = createNitro(scene)
    n.setSpots(cramped, flat, 0, 0)
    const out = (scene.children[0] as THREE.Group).children.filter((c) => c.visible)
    let closest = Infinity
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        closest = Math.min(closest, out[i].position.distanceTo(out[j].position))
      }
    }
    expect(closest, 'two bottles ended up in the same place').toBeGreaterThan(0)
  })

  it('still places them when the roads are too small to keep them apart', () => {
    // A stub with nowhere far enough to go: a bottle you can reach beats a gap.
    const scene = new THREE.Scene()
    const n = createNitro(scene)
    n.setSpots([{ x: 60, z: 0 }, { x: 65, z: 0 }], flat, 0, 0)
    const out = (scene.children[0] as THREE.Group).children.filter((c) => c.visible)
    expect(out.length).toBeGreaterThan(0)
  })
})

describe('colour-coded nitro', () => {
  it('offers at least three distinctly-coloured bottles, each a real boost', () => {
    expect(NITRO_TYPES.length).toBeGreaterThanOrEqual(3)
    const colours = new Set(NITRO_TYPES.map((t) => t.color))
    expect(colours.size, 'two types share a colour').toBe(NITRO_TYPES.length)
    for (const t of NITRO_TYPES) {
      expect(t.mult, `${t.id} does not raise top speed`).toBeGreaterThan(1)
      expect(t.accel).toBeGreaterThan(0)
      expect(t.time).toBeGreaterThan(0)
    }
  })

  it('has a short hard punch and a long gentle push — the whole point of the colours', () => {
    const shortest = NITRO_TYPES.reduce((a, b) => (b.time < a.time ? b : a))
    const longest = NITRO_TYPES.reduce((a, b) => (b.time > a.time ? b : a))
    expect(shortest.time).toBeLessThan(longest.time)
    // the short one hits harder up top than the long one
    expect(shortest.mult).toBeGreaterThan(longest.mult)
  })

  it('spreads every type across the bottle field', () => {
    const seen = new Set<string>()
    for (let i = 0; i < NITRO_TYPES.length * 4; i++) seen.add(nitroTypeFor(i).id)
    expect(seen.size, 'a colour never appears in the field').toBe(NITRO_TYPES.length)
  })

  it('collecting a bottle reports the type standing there, tinted to match', () => {
    const scene = new THREE.Scene()
    const nitro = createNitro(scene)
    nitro.setSpots(citySpots(), flat, 0, 0)
    const target = bottles(scene).find((b) => b.visible)!
    const got = nitro.update(target.position.x, target.position.z, 0.016)
    expect(got).not.toBeNull()
    expect(NITRO_TYPES).toContain(got!)
  })
})

describe('nitro corridors', () => {
  it('lays a spaced chain the length of a long straight arterial', () => {
    // A primary road straight across most of the map.
    const road = straightRoad(-900, 900, 10, 'primary')
    const chain = corridorSpots([road])

    // count ≈ length / spacing — a bottle you can hop between all the way across
    expect(chain.length).toBeGreaterThanOrEqual(Math.floor(1800 / CORRIDOR_SPACING) - 1)
    expect(chain.length).toBeLessThanOrEqual(Math.ceil(1800 / CORRIDOR_SPACING) + 1)
    // ...but never crowded
    expect(closestPair(chain)).toBeGreaterThanOrEqual(CORRIDOR_MIN_APART)
  })

  it('leaves a short road, or a curvy one, without a corridor', () => {
    const short = straightRoad(-100, 100, 10, 'primary') // well under CORRIDOR_MIN_SPAN
    expect(corridorSpots([short])).toEqual([])

    // A long road that keeps turning: plenty of arc length, no straight run.
    const zigzag: Vec2[] = []
    for (let i = 0; i < 40; i++) zigzag.push({ x: i * 50, z: i % 2 === 0 ? 0 : 200 })
    expect(corridorSpots([{ points: zigzag, kind: 'primary' }])).toEqual([])
  })

  it('ignores minor roads however straight and long they run', () => {
    const lane = straightRoad(-900, 900, 10, 'residential')
    expect(corridorSpots([lane])).toEqual([])
  })

  it('keeps every corridor spot inside the ±RADIUS map', () => {
    // A motorway running well past both edges of the world.
    const road = straightRoad(-1500, 1500, 10, 'motorway')
    const chain = corridorSpots([road])
    expect(chain.length).toBeGreaterThan(0)
    for (const p of chain) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(1000)
      expect(Math.abs(p.z)).toBeLessThanOrEqual(1000)
    }
  })

  it('is deterministic — the same roads give the same chain', () => {
    const roads: Road[] = [straightRoad(-900, 900, 10, 'primary')]
    expect(corridorSpots(roads)).toEqual(corridorSpots(roads))
  })

  it('places bottles when handed the roads, and keeps the near-car scatter too', () => {
    const scene = new THREE.Scene()
    const n = createNitro(scene)
    const roads: Road[] = [straightRoad(-900, 900, 10, 'primary')]
    // car sitting on the arterial, with the usual scatter pool around it
    n.setSpots(citySpots(), flat, 0, 0, roads)
    expect(bottles(scene).filter((b) => b.visible).length).toBeGreaterThan(0)
  })
})
