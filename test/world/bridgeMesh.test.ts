import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildBridges } from '../../src/world/bridgeMesh'
import { buildDecks } from '../../src/world/bridge'
import type { Road, Vec2 } from '../../src/geo/types'

const flat = { heightAt: () => 0 }
const v = (x: number, z: number): Vec2 => ({ x, z })

/** A 100m overpass: layer 1, so it arches. */
const overpass: Road = {
  points: Array.from({ length: 11 }, (_, i) => v(i * 10, 0)),
  kind: 'primary',
  bridge: true,
  layer: 1,
}

/** Every Y in the built geometry. */
function heights(o: THREE.Object3D): number[] {
  const ys: number[] = []
  o.traverse((c) => {
    const g = (c as THREE.Mesh).geometry
    const pos = g?.attributes?.position
    if (!pos) return
    for (let i = 0; i < pos.count; i++) ys.push(pos.getY(i))
  })
  return ys
}

describe('buildBridges', () => {
  const decks = buildDecks([overpass], flat)

  it('builds the deck to its profile, not flat at its first point', () => {
    // The bug: emitRibbon hands the y callback the EDGE vertices, whose
    // coordinates aren't the road points'. Looking the height up by position
    // missed every time and fell back to y[0] — a flat deck, while the car drove
    // the profiled one underneath it.
    const mesh = buildBridges(decks, flat)
    const ys = heights(mesh)
    const span = Math.max(...ys) - Math.min(...ys)
    expect(span, 'an arched deck cannot be flat').toBeGreaterThan(3)
  })

  it('takes the deck as high as the profile says', () => {
    const peak = Math.max(...decks[0].y)
    const ys = heights(buildBridges(decks, flat))
    expect(Math.max(...ys)).toBeGreaterThanOrEqual(peak - 0.01)
  })

  it('never leaves the deck below the ground it spans', () => {
    for (const y of heights(buildBridges(decks, flat))) expect(y).toBeGreaterThanOrEqual(-0.01)
  })

  it('builds nothing for a city with no bridges', () => {
    expect(buildBridges([], flat).children).toHaveLength(0)
  })
})
