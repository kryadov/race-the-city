/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest'
import { parseDemoAsset, DEMO_CITY, type DemoAsset } from '../../src/geo/demoCity'
import { parseOsm } from '../../src/geo/parse'
import { Projector } from '../../src/geo/project'
import { startPose } from '../../src/world/start'
import type { LatLon } from '../../src/geo/types'

/** A minimal-but-valid asset: a 3×3 height grid and one tagged way with its nodes. */
function craftAsset(over: Partial<DemoAsset> = {}): DemoAsset {
  return {
    name: 'Test City',
    center: { lat: 48.85, lon: 2.35 },
    radius: 10,
    segments: 2, // → 3×3 = 9 heights
    heights: [0, 0, 0, 0, 5, 0, 0, 0, 0],
    elements: [
      { type: 'node', id: 1, lat: 48.85, lon: 2.35 },
      { type: 'node', id: 2, lat: 48.8501, lon: 2.3501 },
      { type: 'way', id: 100, nodes: [1, 2], tags: { highway: 'residential' } },
    ],
    ...over,
  }
}

describe('parseDemoAsset', () => {
  it('turns a valid asset into a center, an OSM response and a working provider', () => {
    const demo = parseDemoAsset(craftAsset())
    expect(demo.center).toEqual({ lat: 48.85, lon: 2.35 })
    expect(demo.osm.elements.length).toBe(3)
    expect(demo.provider.heightAt(0, 0)).toBeCloseTo(5) // the centre node of the grid
    expect(demo.provider.heightAt(-10, -10)).toBeCloseTo(0) // a corner
  })

  it('rejects a height grid that is the wrong size for its segments', () => {
    expect(() => parseDemoAsset(craftAsset({ heights: [0, 1, 2] }))).toThrow(/heights must be 9/)
  })

  it('rejects an empty or malformed asset', () => {
    expect(() => parseDemoAsset(craftAsset({ elements: [] }))).toThrow(/no OSM elements/)
    expect(() => parseDemoAsset(craftAsset({ center: undefined as unknown as LatLon }))).toThrow(/missing center/)
    expect(() => parseDemoAsset(craftAsset({ segments: 0 }))).toThrow(/radius\/segments/)
  })

  it('uses an em-dash sentinel that no real place name would collide with', () => {
    expect(DEMO_CITY).toContain('demo')
    expect(DEMO_CITY).not.toMatch(/^[a-z ]+$/i) // not a plain word a geocoder would accept
  })
})

// The real committed asset must actually parse into a drivable city. Loaded via a
// Vite glob (not node fs — tests are browser-pure) so a checkout without the baked
// file simply skips these; CI/commit ships the file.
const assetMods = import.meta.glob('../../public/demo/paris.json', { eager: true, import: 'default' })
const asset = Object.values(assetMods)[0] as DemoAsset | undefined

describe.runIf(asset)('the shipped demo asset (public/demo/paris.json)', () => {
  it('parses without error', () => {
    expect(() => parseDemoAsset(asset!)).not.toThrow()
  })

  it('builds a world with roads, buildings and water — a real city, not a stub', () => {
    const demo = parseDemoAsset(asset!)
    const world = parseOsm(demo.osm, new Projector(demo.center))
    expect(world.roads.length).toBeGreaterThan(20)
    expect(world.buildings.length).toBeGreaterThan(50)
    expect(world.water.length).toBeGreaterThan(0) // the Seine
  })

  it('yields a valid start pose on a road, inside the map', () => {
    const demo = parseDemoAsset(asset!)
    const world = parseOsm(demo.osm, new Projector(demo.center))
    const pose = startPose(world.roads, world.buildings.map((b) => b.footprint))
    expect(pose).not.toBeNull()
    expect(Number.isFinite(pose!.x)).toBe(true)
    expect(Number.isFinite(pose!.z)).toBe(true)
    expect(Math.abs(pose!.x)).toBeLessThanOrEqual(asset!.radius)
    expect(Math.abs(pose!.z)).toBeLessThanOrEqual(asset!.radius)
  })

  it('stores a full height grid for its segments', () => {
    const n = asset!.segments + 1
    expect(asset!.heights.length).toBe(n * n)
  })

  it('names the Seine, so crossing it shows the river label', () => {
    const demo = parseDemoAsset(asset!)
    const world = parseOsm(demo.osm, new Projector(demo.center))
    expect(world.waterNames.some((w) => /seine/i.test(w.name))).toBe(true)
  })
})
