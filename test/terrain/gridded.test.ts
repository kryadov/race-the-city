import { describe, it, expect } from 'vitest'
import { griddedProvider, gridProviderFromArray } from '../../src/terrain/gridded'

const HALF = 1000
const SEG = 160
const STEP = (HALF * 2) / SEG // 12.5m — the ground mesh's cell size

describe('griddedProvider', () => {
  it('agrees exactly with the source at the mesh nodes', () => {
    // the ground mesh reads the source at these very points, so they must match
    const src = { heightAt: (x: number, z: number) => Math.sin(x / 40) * 9 + Math.cos(z / 55) * 5 }
    const g = griddedProvider(src, HALF, SEG)
    for (let i = 0; i < SEG; i += 17) {
      const x = -HALF + i * STEP
      const z = -HALF + i * STEP
      expect(g.heightAt(x, z)).toBeCloseTo(src.heightAt(x, z), 3)
    }
  })

  it('ignores detail finer than a cell, the way the drawn surface does', () => {
    // A spike between two nodes: the mesh cannot show it, so the car must not
    // feel it — that mismatch is what sank the car into the visible ground.
    const flatWithSpike = {
      heightAt: (x: number, _z: number) => (Math.abs(x - 6.25) < 0.6 ? 40 : 0),
    }
    const g = griddedProvider(flatWithSpike, HALF, SEG)
    expect(flatWithSpike.heightAt(6.25, 0)).toBe(40) // the raw source spikes
    expect(g.heightAt(6.25, 0)).toBeCloseTo(0) // the visible ground does not
  })

  it('runs the chord between nodes, not the source curve', () => {
    // A cliff falling between two nodes (x=0 -> 0m, x=12.5 -> 20m): the drawn
    // surface can only ramp across the cell, so heightAt must ramp too.
    const cliff = { heightAt: (x: number) => (x < STEP / 2 ? 0 : 20) }
    const g = griddedProvider(cliff, HALF, SEG)
    expect(g.heightAt(0, 0)).toBeCloseTo(0) // node
    expect(g.heightAt(STEP, 0)).toBeCloseTo(20) // node
    expect(g.heightAt(STEP / 2, 0)).toBeCloseTo(10) // the chord, not the cliff's 20
  })

  it('interpolates in both directions', () => {
    const slope = { heightAt: (x: number, z: number) => x * 0.1 + z * 0.2 }
    const g = griddedProvider(slope, HALF, SEG)
    // linear input is reproduced exactly by linear interpolation
    expect(g.heightAt(3, 7)).toBeCloseTo(3 * 0.1 + 7 * 0.2, 4)
    expect(g.heightAt(-27.4, 61.9)).toBeCloseTo(-27.4 * 0.1 + 61.9 * 0.2, 4)
  })

  it('holds the edge value beyond the mesh instead of exploding', () => {
    const src = { heightAt: () => 12 }
    const g = griddedProvider(src, HALF, SEG)
    expect(g.heightAt(HALF + 500, 0)).toBeCloseTo(12)
    expect(g.heightAt(-HALF - 500, HALF + 900)).toBeCloseTo(12)
    expect(Number.isFinite(g.heightAt(1e9, -1e9))).toBe(true)
  })
})

describe('gridProviderFromArray', () => {
  it('reproduces what griddedProvider sampled from the same source', () => {
    // The baked demo stores a pre-sampled grid; feeding that grid straight in must
    // give the identical provider griddedProvider builds by sampling the source.
    const src = { heightAt: (x: number, z: number) => Math.sin(x / 40) * 9 + Math.cos(z / 55) * 5 }
    const seg = 40
    const half = 1000
    const step = (half * 2) / seg
    const n = seg + 1
    const h = new Float32Array(n * n)
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) h[j * n + i] = src.heightAt(-half + i * step, -half + j * step)
    }
    const fromArray = gridProviderFromArray(h, half, seg)
    const sampled = griddedProvider(src, half, seg)
    for (let i = 0; i < n; i += 7) {
      const x = -half + i * step + 3.3
      const z = -half + i * step - 8.1
      expect(fromArray.heightAt(x, z)).toBeCloseTo(sampled.heightAt(x, z), 5)
    }
  })

  it('interpolates a tiny known grid and clamps outside it', () => {
    // 3×3 grid (segments = 2) over [-10,10]²; a corner ramp of heights.
    // nodes at x,z ∈ {-10, 0, 10}. h[j*3 + i], i→x, j→z.
    const h = [0, 1, 2, 10, 11, 12, 20, 21, 22]
    const g = gridProviderFromArray(h, 10, 2)
    expect(g.heightAt(-10, -10)).toBeCloseTo(0) // corner node
    expect(g.heightAt(10, 10)).toBeCloseTo(22) // opposite corner node
    expect(g.heightAt(0, 0)).toBeCloseTo(11) // centre node
    expect(g.heightAt(-5, -10)).toBeCloseTo(0.5) // halfway between h=0 and h=1 along x
    expect(g.heightAt(-10, -5)).toBeCloseTo(5) // halfway between h=0 and h=10 along z
    expect(g.heightAt(1000, 1000)).toBeCloseTo(22) // clamped to the far corner
  })
})
