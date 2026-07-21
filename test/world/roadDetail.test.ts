import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildRoadDetail } from '../../src/world/roadDetail'
import type { Road } from '../../src/geo/types'

const flat = { heightAt: () => 0 }

const road = (cycleway: boolean): Road => ({
  points: [
    { x: 0, z: 0 },
    { x: 40, z: 0 },
    { x: 80, z: 10 },
  ],
  kind: 'residential',
  ...(cycleway ? { cycleway: true } : {}),
})

const hasCycleMesh = (o: THREE.Object3D): boolean => !!o.getObjectByName('cycle-lane')

describe('buildRoadDetail cycle lanes', () => {
  it('paints a cycle-lane stripe along a road flagged with a cycleway', () => {
    const detail = buildRoadDetail([road(true)], flat)
    expect(hasCycleMesh(detail)).toBe(true)
  })

  it('adds no cycle-lane stripe for a plain road', () => {
    const detail = buildRoadDetail([road(false)], flat)
    expect(hasCycleMesh(detail)).toBe(false)
  })

  it('gives the stripe geometry that follows the road (a vertex per segment quad)', () => {
    const detail = buildRoadDetail([road(true)], flat)
    const stripe = detail.getObjectByName('cycle-lane') as THREE.Mesh
    const pos = stripe.geometry.getAttribute('position') as THREE.BufferAttribute
    // Two segments × one quad (6 verts) each = 12 vertices.
    expect(pos.count).toBe(12)
  })
})
