import { describe, it, expect } from 'vitest'
import { griddedProvider } from '../../src/terrain/gridded'

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
