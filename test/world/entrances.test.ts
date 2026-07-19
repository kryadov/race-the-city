import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { frontEdge, entranceFor, buildEntrances } from '../../src/world/entrances'
import { pointInPolygon } from '../../src/physics/collide'
import type { Building, Vec2 } from '../../src/geo/types'

const v = (x: number, z: number): Vec2 => ({ x, z })

/** A 20x8 block, clockwise. Its long walls run along x. */
const cw: Vec2[] = [v(0, 0), v(0, 8), v(20, 8), v(20, 0)]
/** The same block, wound the other way — OSM ways come both ways round. */
const ccw: Vec2[] = [v(0, 0), v(20, 0), v(20, 8), v(0, 8)]

const building = (footprint: Vec2[], kind: Building['kind'] = 'retail'): Building => ({
  footprint,
  height: 12,
  kind,
})

describe('frontEdge', () => {
  it('picks the longest wall', () => {
    const e = frontEdge(cw)!
    expect(Math.hypot(e.a.x - e.b.x, e.a.z - e.b.z)).toBeCloseTo(20)
  })

  it('refuses a footprint too small to have a front', () => {
    expect(frontEdge([v(0, 0), v(0.5, 0), v(0.5, 0.5)])).toBeNull()
    expect(frontEdge([v(0, 0), v(1, 1)])).toBeNull()
  })
})

describe('entranceFor', () => {
  it('puts the door outside the building, whichever way the ring is wound', () => {
    for (const [name, ring] of [['clockwise', cw], ['counter-clockwise', ccw]] as const) {
      const e = entranceFor(building(ring))!
      expect(pointInPolygon(e.x, e.z, ring), `${name}: door must not open into the lobby`).toBe(false)
    }
  })

  it('faces the door away from the wall', () => {
    const e = entranceFor(building(cw))!
    // step a metre along the facing direction — that must lead further outside
    const ahead = { x: e.x + Math.sin(e.angle), z: e.z + Math.cos(e.angle) }
    expect(pointInPolygon(ahead.x, ahead.z, cw)).toBe(false)
  })

  it('sits on the middle of the long wall, snug against it', () => {
    const e = entranceFor(building(cw))!
    expect(e.x).toBeCloseTo(10, 1) // midpoint of the 20m run
    expect(Math.min(Math.abs(e.z - 0), Math.abs(e.z - 8))).toBeLessThan(0.2) // hard against a wall
  })

  it('carries the building kind through, for the signage', () => {
    expect(entranceFor(building(cw, 'office'))!.kind).toBe('office')
  })

  it('gives up on a degenerate footprint rather than throwing', () => {
    expect(entranceFor(building([v(0, 0), v(0, 0), v(0, 0)]))).toBeNull()
  })
})

describe('buildEntrances handles', () => {
  const flat = { heightAt: () => 0 }
  const block = (ox: number, kind: Building['kind']): Building => ({
    footprint: [v(ox, 0), v(ox, 8), v(ox + 20, 8), v(ox + 20, 0)],
    height: 12,
    kind,
  })

  /** Doors and signs are drawn at unit scale; handles are the small scaled boxes. */
  const handleMeshOf = (root: THREE.Object3D): THREE.InstancedMesh => {
    const m = new THREE.Matrix4()
    const s = new THREE.Vector3()
    let found: THREE.InstancedMesh | undefined
    root.traverse((o) => {
      const im = o as THREE.InstancedMesh
      if (!im.isInstancedMesh || !im.count) return
      im.getMatrixAt(0, m)
      m.decompose(new THREE.Vector3(), new THREE.Quaternion(), s)
      if (s.x < 0.9) found = im // scaled down from the unit box: a handle
    })
    expect(found, 'no handle mesh in the entrances group').toBeDefined()
    return found!
  }

  it('mounts a handle on every door', () => {
    const g = buildEntrances([block(0, 'house'), block(40, 'retail')], flat)
    expect(handleMeshOf(g).count).toBe(2)
  })

  it('gives timber a knob and glass a lever — two types on one street', () => {
    // house is a knob kind, retail a lever kind; door order follows building order
    const handles = handleMeshOf(buildEntrances([block(0, 'house'), block(40, 'retail')], flat))
    const m = new THREE.Matrix4()
    const s = new THREE.Vector3()
    const widths: number[] = []
    for (let i = 0; i < handles.count; i++) {
      handles.getMatrixAt(i, m)
      m.decompose(new THREE.Vector3(), new THREE.Quaternion(), s)
      widths.push(s.x)
    }
    expect(Math.min(...widths)).toBeCloseTo(0.16, 2) // the knob
    expect(Math.max(...widths)).toBeCloseTo(0.5, 2) // the lever bar
  })
})
