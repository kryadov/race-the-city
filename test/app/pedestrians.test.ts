import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createPedestrians, dressForSeason } from '../../src/app/pedestrians'
import { buildDecks, createDeckIndex } from '../../src/world/bridge'
import type { Road, Vec2 } from '../../src/geo/types'
import type { SeasonName } from '../../src/world/season'

// The winter warm anchor, mirrored from pedestrians.ts (season.test.ts likewise
// duplicates its little HSL helper rather than reaching into the module).
const WARM = 0.08
// [h,s,l] of a packed colour, read the same way pedestrians.ts writes it — via
// THREE.Color — so the numbers line up channel for channel.
const hsl = (hex: number): { h: number; s: number; l: number } => {
  const out = { h: 0, s: 0, l: 0 }
  new THREE.Color(hex).getHSL(out)
  return out
}
// Distance between two hues round the wheel, taking the shorter arc.
const hueArc = (a: number, b: number): number => {
  const d = Math.abs(a - b)
  return Math.min(d, 1 - d)
}

const SHIRT = 0x3a6ea5 // a cool mid blue from the crowd's palette
const SEASONS: SeasonName[] = ['spring', 'summer', 'autumn', 'winter']

describe('dressForSeason', () => {
  it('is deterministic — same colour and season give the same result', () => {
    for (const s of SEASONS) expect(dressForSeason(SHIRT, s)).toBe(dressForSeason(SHIRT, s))
  })

  it('lightens for summer and darkens for winter, spring/autumn between', () => {
    const base = hsl(SHIRT).l
    const summer = hsl(dressForSeason(SHIRT, 'summer')).l
    const spring = hsl(dressForSeason(SHIRT, 'spring')).l
    const autumn = hsl(dressForSeason(SHIRT, 'autumn')).l
    const winter = hsl(dressForSeason(SHIRT, 'winter')).l
    // Summer is the light extreme, winter the dark one, and the crowd reads
    // noticeably different between them.
    expect(summer).toBeGreaterThan(base)
    expect(winter).toBeLessThan(base)
    expect(summer).toBeGreaterThan(winter + 0.15)
    // A monotone run from lightest to darkest.
    expect(summer).toBeGreaterThan(spring)
    expect(spring).toBeGreaterThan(autumn)
    expect(autumn).toBeGreaterThan(winter)
  })

  it('mutes winter clothes and brightens summer ones', () => {
    const base = hsl(SHIRT).s
    expect(hsl(dressForSeason(SHIRT, 'winter')).s, 'muted').toBeLessThan(base)
    expect(hsl(dressForSeason(SHIRT, 'summer')).s, 'crisp').toBeGreaterThan(base)
  })

  it('drags a cool colour toward warm in winter but leaves summer crisp', () => {
    const base = hueArc(hsl(SHIRT).h, WARM)
    // Winter pulls the blue a good way toward orange — much closer to the warm
    // anchor than it started.
    expect(base - hueArc(hsl(dressForSeason(SHIRT, 'winter')).h, WARM)).toBeGreaterThan(0.1)
    // Summer has no warm drag, so the hue barely moves — only 8-bit repacking
    // rounding, nowhere near winter's shift.
    expect(Math.abs(hueArc(hsl(dressForSeason(SHIRT, 'summer')).h, WARM) - base)).toBeLessThan(0.01)
  })

  it('keeps every packed result a valid 24-bit colour', () => {
    for (const s of SEASONS) {
      const c = dressForSeason(SHIRT, s)
      expect(Number.isInteger(c)).toBe(true)
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(0xffffff)
    }
  })
})

describe('walking bridges', () => {
  const v = (x: number, z: number): Vec2 => ({ x, z })
  const flat = { heightAt: () => 0 } // terrain sits at y=0, so the bridge is what lifts them
  // A straight road with its middle vertex at the origin, so a walker seeded from
  // rand()=0.5 lands there (spawn picks node floor(0.5*3) = 1, the middle) — on the
  // crown of the arch on the bridge case, on flat ground on the ground case.
  const span: Vec2[] = [v(-100, 0), v(0, 0), v(100, 0)]

  /** The y of every body instance, read back out of the InstancedMesh. */
  function bodyYs(scene: THREE.Scene): number[] {
    const bodies = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh
    const m = new THREE.Matrix4()
    const ys: number[] = []
    for (let i = 0; i < bodies.count; i++) {
      bodies.getMatrixAt(i, m)
      ys.push(new THREE.Vector3().setFromMatrixPosition(m).y)
    }
    return ys
  }

  it('seats a walker on a bridge road up on the deck, not the ground under it', () => {
    // layer 2 forces an arch over flat ground: the deck rises to ~10m mid-span.
    const bridge: Road[] = [{ points: span, kind: 'primary', bridge: true, layer: 2 }]
    const decks = createDeckIndex(buildDecks(bridge, flat))
    const deckY = decks.heightAt(0, 0) // the crown height, well above the ground
    expect(deckY).not.toBeNull()
    expect(deckY!).toBeGreaterThan(5)

    const scene = new THREE.Scene()
    const p = createPedestrians(scene, bridge, flat, () => 0.5, 6, [], 0, decks)
    p.update(0, 0, 0) // dt=0: hold them at the seeded vertex so base = (0,0)
    // Every walker spawned at the crown vertex rides the deck, bob aside.
    for (const y of bodyYs(scene)) expect(Math.abs(y - deckY!)).toBeLessThan(0.05)
  })

  it('leaves a walker on a plain ground road on the terrain', () => {
    // The same geometry, but not a bridge and no decks: they stay at ground y=0.
    const ground: Road[] = [{ points: span, kind: 'primary' }]
    const scene = new THREE.Scene()
    const p = createPedestrians(scene, ground, flat, () => 0.5, 6)
    p.update(0, 0, 0)
    for (const y of bodyYs(scene)) expect(Math.abs(y)).toBeLessThan(0.05)
  })
})

describe('walking an island in a river', () => {
  const v = (x: number, z: number): Vec2 => ({ x, z })
  const flat = { heightAt: () => 0 }
  const rect = (x0: number, z0: number, x1: number, z1: number): Vec2[] => [
    v(x0, z0), v(x1, z0), v(x1, z1), v(x0, z1),
  ]
  // A road sitting inside a big water body — but on an island cut out of it.
  const road: Road[] = [{ points: [v(-60, 0), v(0, 0), v(60, 0)], kind: 'residential' }]
  const river = [rect(-500, -500, 500, 500)] // water everywhere around
  const island = [rect(-120, -50, 120, 50)] // the island the road runs along

  /** How many body instances are still visible (not collapsed to scale 0 by hide). */
  function visibleBodies(scene: THREE.Scene): number {
    const bodies = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh
    const m = new THREE.Matrix4()
    const s = new THREE.Vector3()
    let n = 0
    for (let i = 0; i < bodies.count; i++) {
      bodies.getMatrixAt(i, m)
      m.decompose(new THREE.Vector3(), new THREE.Quaternion(), s)
      if (s.x > 0.5) n++
    }
    return n
  }

  it('hides walkers when the road lies in open water (no island)', () => {
    const scene = new THREE.Scene()
    const p = createPedestrians(scene, road, flat, () => 0.5, 6, river, 0, undefined, [])
    p.update(0, 0, 0)
    expect(visibleBodies(scene)).toBe(0) // both pavements are wet → all hidden
  })

  it('keeps them when the road is on an island cut out of the water', () => {
    const scene = new THREE.Scene()
    const p = createPedestrians(scene, road, flat, () => 0.5, 6, river, 0, undefined, island)
    p.update(0, 0, 0)
    expect(visibleBodies(scene)).toBeGreaterThan(0) // the island is dry land → they stay
  })
})
