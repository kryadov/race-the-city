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
