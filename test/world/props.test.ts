import { describe, it, expect, beforeAll } from 'vitest'
import * as THREE from 'three'
import { buildProps, propFootprints } from '../../src/world/props'
import type { Prop } from '../../src/geo/types'

const flat = { heightAt: () => 0 }
const at = (x: number, z: number, kind: Prop['kind']): Prop => ({ at: { x, z }, kind })

beforeAll(() => {
  // three's CanvasTexture isn't involved here, but building props must not need a DOM
})

/** The bounding box of everything built for one prop kind. */
function boxOf(props: Prop[]): THREE.Box3 {
  const o = buildProps(props, flat)
  return new THREE.Box3().setFromObject(o)
}

describe('fountains', () => {
  it('is the size of a real one, not a manhole', () => {
    // a car is 4m long; a fountain you could sit on is wider than that
    const b = boxOf([at(0, 0, 'fountain')])
    expect(b.max.x - b.min.x, 'across').toBeGreaterThan(6)
  })

  it('stands tall enough to see over the traffic', () => {
    const b = boxOf([at(0, 0, 'fountain')])
    expect(b.max.y).toBeGreaterThan(3)
  })

  it('is built from enough parts to read as a fountain', () => {
    // basin, coping, pool, two tiers, jets and the arcs that say what it is
    expect(buildProps([at(0, 0, 'fountain')], flat).children.length).toBeGreaterThan(10)
  })

  it('draws once per part however many fountains there are', () => {
    const one = buildProps([at(0, 0, 'fountain')], flat).children.length
    const many = buildProps(
      Array.from({ length: 40 }, (_, i) => at(i * 30, 0, 'fountain')),
      flat,
    ).children.length
    expect(many).toBe(one)
  })

  it('is solid, and its footprint covers the basin', () => {
    const [ring] = propFootprints([at(0, 0, 'fountain')])
    const half = Math.max(...ring.map((p) => Math.abs(p.x)))
    expect(half, 'you should not drive through the coping').toBeGreaterThan(3)
  })
})

describe('props', () => {
  it('builds each kind, and nothing for an empty city', () => {
    for (const kind of ['fountain', 'statue', 'flowerbed'] as const) {
      expect(buildProps([at(0, 0, kind)], flat).children.length).toBeGreaterThan(0)
    }
    expect(buildProps([], flat).children).toHaveLength(0)
  })

  it('stands them on the ground', () => {
    const hill = { heightAt: () => 40 }
    const o = buildProps([at(0, 0, 'statue')], hill)
    const b = new THREE.Box3().setFromObject(o)
    expect(b.min.y).toBeGreaterThan(39)
  })
})

describe('statues', () => {
  // Spread widely so the position hash lands in every bucket; a tight grid
  // (or a step matching the hash's own multiplier) could alias into one kind.
  const scattered = (n: number): Prop[] =>
    Array.from({ length: n }, (_, i) => at(i * 17.3, i * 29.7, 'statue'))

  it('is not one shape copy-pasted down the street', () => {
    // Every variant has at least 3 parts, so 3 meshes means only one shape
    // was ever picked; more than 3 means a second (or third, or fourth) shape
    // is standing among them.
    const children = buildProps(scattered(60), flat).children.length
    expect(children).toBeGreaterThan(3)
  })

  it('gives different statues different footprints', () => {
    // The four kinds were designed with different ground radii (a horse needs
    // more room than a bust on a column); if they all came out equal, variety
    // isn't actually reaching the collision grid.
    const widths = new Set(
      propFootprints(scattered(60)).map((ring) => {
        const half = Math.max(...ring.map((p) => Math.abs(p.x)))
        return Math.round(half * 100)
      }),
    )
    expect(widths.size).toBeGreaterThan(1)
  })

  it('picks the same shape for the same city on every build', () => {
    const props = scattered(60)
    const a = buildProps(props, flat)
    const b = buildProps(props, flat)
    expect(b.children.length).toBe(a.children.length)
    const boxA = new THREE.Box3().setFromObject(a)
    const boxB = new THREE.Box3().setFromObject(b)
    expect(boxB.min.toArray()).toEqual(boxA.min.toArray())
    expect(boxB.max.toArray()).toEqual(boxA.max.toArray())
  })

  it('picks by position, not by array order', () => {
    // Same statues, listed in a different order — OSM gives no guarantee an
    // element order is stable between parses of the same city. The radius
    // chosen for a given spot must not depend on where it sits in the list.
    const props = scattered(40)
    const reversed = [...props].reverse()
    const radiiByPos = (list: Prop[]): Map<string, number> => {
      const out = new Map<string, number>()
      propFootprints(list).forEach((ring, i) => {
        const half = Math.max(...ring.map((p) => Math.abs(p.x - list[i].at.x)))
        out.set(`${list[i].at.x},${list[i].at.z}`, half)
      })
      return out
    }
    const a = radiiByPos(props)
    const b = radiiByPos(reversed)
    for (const [key, half] of a) expect(b.get(key)).toBe(half)
  })

  it('still draws one instanced mesh per part per shape, how many ever statues', () => {
    const few = buildProps(scattered(4), flat).children.length
    const many = buildProps(scattered(80), flat).children.length
    // Not exactly equal like the single-shape fountain case — more statues
    // means more of the four shapes get used — but it must not grow linearly
    // with the statue count the way one-mesh-per-statue would.
    expect(many).toBeLessThan(80)
    expect(many).toBeGreaterThanOrEqual(few)
  })
})
