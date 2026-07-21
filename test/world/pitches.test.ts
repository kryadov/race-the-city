import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  buildPitches,
  pitchBox,
  figureSpots,
  MAX_PITCHES,
  MAX_FIGURES,
} from '../../src/world/pitches'
import { pointInPolygon } from '../../src/physics/collide'
import type { Pitch, Vec2 } from '../../src/geo/types'

const flat = { heightAt: () => 0 }
const hill = { heightAt: (x: number, _z: number) => x * 0.1 }

const v = (x: number, z: number): Vec2 => ({ x, z })
/** A rectangle `w`×`h`, cornered at (ox, oz). */
const rect = (w: number, h: number, ox = 0, oz = 0): Vec2[] => [
  v(ox, oz),
  v(ox + w, oz),
  v(ox + w, oz + h),
  v(ox, oz + h),
]
const pitch = (ring: Vec2[], sport: Pitch['sport'] = 'soccer'): Pitch => ({ ring, sport })

/** A deterministic PRNG for the figure-spot tests. */
function testRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const surfaces = (o: THREE.Object3D): THREE.Object3D[] =>
  o.children.filter((c) => c.name === 'pitch-surface')

describe('pitchBox', () => {
  it('fits an oriented box to a rectangle, long axis along its longer side', () => {
    const box = pitchBox(rect(100, 60, 0, 0))
    expect(box.cx).toBeCloseTo(50)
    expect(box.cz).toBeCloseTo(30)
    expect(box.halfLen).toBeCloseTo(50) // half the 100m side
    expect(box.halfWid).toBeCloseTo(30) // half the 60m side
    expect(box.halfLen).toBeGreaterThanOrEqual(box.halfWid)
  })

  it('keeps the long axis long even when the longer side runs across z', () => {
    const box = pitchBox(rect(40, 90))
    expect(box.halfLen).toBeCloseTo(45)
    expect(box.halfWid).toBeCloseTo(20)
  })
})

describe('figureSpots', () => {
  it('clips every spot inside the polygon and never exceeds the cap', () => {
    const ring = rect(100, 60)
    const spots = figureSpots(ring, testRng(1), 5)
    expect(spots.length).toBeLessThanOrEqual(5)
    expect(spots.length).toBeGreaterThan(0)
    for (const s of spots) expect(pointInPolygon(s.x, s.z, ring), `${s.x},${s.z}`).toBe(true)
  })

  it('returns nothing for a zero budget', () => {
    expect(figureSpots(rect(100, 60), testRng(2), 0)).toEqual([])
  })

  it('is deterministic for a given rng seed', () => {
    const a = figureSpots(rect(80, 50), testRng(3), 4)
    const b = figureSpots(rect(80, 50), testRng(3), 4)
    expect(a).toEqual(b)
  })
})

describe('buildPitches', () => {
  it('builds nothing for an empty list', () => {
    const o = buildPitches([], flat)
    expect(o.children.length).toBe(0)
  })

  it('builds one green surface mesh per pitch, plus a markings mesh', () => {
    const o = buildPitches([pitch(rect(100, 60)), pitch(rect(60, 40, 200, 0))], flat)
    expect(surfaces(o).length).toBe(2)
    expect(o.children.some((c) => c.name === 'pitch-markings')).toBe(true)
  })

  it('gives a soccer pitch goals (not a hoop), a basketball pitch a hoop (rim)', () => {
    const soccer = buildPitches([pitch(rect(100, 60), 'soccer')], flat)
    const basket = buildPitches([pitch(rect(28, 15), 'basketball')], flat)
    // The rim is orange; the goal furniture is white. Distinguish by material colour.
    const hasColor = (o: THREE.Object3D, hex: number): boolean => {
      let found = false
      o.traverse((c) => {
        const mat = (c as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
        if (mat && mat.color && mat.color.getHex() === hex) found = true
      })
      return found
    }
    expect(hasColor(basket, 0xdb6a2a)).toBe(true) // rim orange only on basketball
    expect(hasColor(soccer, 0xdb6a2a)).toBe(false)
  })

  it('caps figures across the whole map at MAX_FIGURES', () => {
    // Many pitches, each wanting figures — the global budget must still bind.
    const many: Pitch[] = []
    for (let i = 0; i < 40; i++) many.push(pitch(rect(100, 60, i * 200, 0)))
    const o = buildPitches(many, flat)
    const figs = o.getObjectByName('pitch-figures') as THREE.InstancedMesh | undefined
    expect(figs).toBeDefined()
    expect(figs!.count).toBeLessThanOrEqual(MAX_FIGURES)
  })

  it('caps the number of pitches drawn at MAX_PITCHES', () => {
    const many: Pitch[] = []
    for (let i = 0; i < MAX_PITCHES + 20; i++) many.push(pitch(rect(60, 40, i * 120, 0)))
    const o = buildPitches(many, flat)
    expect(surfaces(o).length).toBeLessThanOrEqual(MAX_PITCHES)
  })

  it('lays the surface on a slope (per-vertex terrain height)', () => {
    const o = buildPitches([pitch(rect(100, 60))], hill)
    const mesh = surfaces(o)[0] as THREE.Mesh
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    const ys = new Set<number>()
    for (let i = 0; i < pos.count; i++) ys.add(Math.round(pos.getY(i) * 100))
    expect(ys.size).toBeGreaterThan(1) // not a single flat height
  })

  it('is deterministic for a given set of pitches', () => {
    const a = buildPitches([pitch(rect(100, 60))], flat)
    const b = buildPitches([pitch(rect(100, 60))], flat)
    const figA = a.getObjectByName('pitch-figures') as THREE.InstancedMesh
    const figB = b.getObjectByName('pitch-figures') as THREE.InstancedMesh
    expect(figA.count).toBe(figB.count)
  })
})
