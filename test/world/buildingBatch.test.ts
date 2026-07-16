import { describe, it, expect, beforeAll } from 'vitest'
import * as THREE from 'three'
import { buildBuildings } from '../../src/world/buildings'
import type { Building, BuildingKind, Vec2 } from '../../src/geo/types'

/**
 * The facades are drawn on a canvas, which node hasn't got. A stub is cheaper
 * and clearer here than pulling jsdom in for the whole suite — the drawing
 * itself is not what these tests are about.
 */
beforeAll(() => {
  const ctx2d = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    fillRect: () => undefined,
    strokeRect: () => undefined,
  }
  ;(globalThis as unknown as { document: unknown }).document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }),
  }
})

const flat = { heightAt: () => 0 }
const v = (x: number, z: number): Vec2 => ({ x, z })

/** `n` little boxes in a row, cycling through the classes. */
function city(n: number): Building[] {
  const kinds: BuildingKind[] = ['house', 'apartments', 'retail', 'office', 'industrial', 'civic']
  return Array.from({ length: n }, (_, i) => ({
    footprint: [v(i * 20, 0), v(i * 20 + 10, 0), v(i * 20 + 10, 10), v(i * 20, 10)],
    height: 9 + (i % 5),
    kind: kinds[i % kinds.length],
  }))
}

/** Meshes that would each cost a draw call. */
const drawCalls = (o: THREE.Object3D): number => {
  let n = 0
  o.traverse((c) => {
    if ((c as THREE.Mesh).geometry) n++
  })
  return n
}

describe('building batching', () => {
  it('draws a city in a handful of calls, not one per building', () => {
    // ~470 buildings in 2km of central St Petersburg was ~470 draw calls, and
    // again for the shadow pass.
    const { mesh } = buildBuildings(city(300), flat)
    expect(drawCalls(mesh), '300 buildings should not cost 300 draws').toBeLessThan(12)
  })

  it('keeps every buildings geometry', () => {
    const one = buildBuildings(city(1), flat).mesh
    const many = buildBuildings(city(24), flat).mesh
    // Walls only: the doors and signs are instanced, so their geometry is one
    // copy however many buildings there are.
    const wallVerts = (o: THREE.Object3D): number => {
      let n = 0
      o.traverse((c) => {
        if ((c as THREE.InstancedMesh).isInstancedMesh) return
        const g = (c as THREE.Mesh).geometry
        if (g?.attributes?.position) n += g.attributes.position.count
      })
      return n
    }
    expect(wallVerts(many)).toBe(wallVerts(one) * 24)
  })

  it('still hands back a footprint per building, for the physics', () => {
    expect(buildBuildings(city(30), flat).footprints).toHaveLength(30)
  })

  it('keeps the classes apart, so each keeps its own facade', () => {
    // one mesh per class present, or a shop would get a warehouse's windows
    const { mesh } = buildBuildings(city(6), flat)
    const mats = new Set<THREE.Material>()
    mesh.traverse((c) => {
      const m = (c as THREE.Mesh).material
      if (m && !Array.isArray(m)) mats.add(m)
    })
    expect(mats.size).toBeGreaterThanOrEqual(6)
  })

  it('carries the vertex colours and facade UVs through the merge', () => {
    const { mesh } = buildBuildings(city(8), flat)
    let checked = 0
    mesh.traverse((c) => {
      const g = (c as THREE.Mesh).geometry
      if (!g?.attributes?.position) return
      if (!g.attributes.color) return
      expect(g.attributes.color.count).toBe(g.attributes.position.count)
      expect(g.attributes.uv.count).toBe(g.attributes.position.count)
      checked++
    })
    expect(checked).toBeGreaterThan(0)
  })

  it('builds nothing from an empty city, and does not throw', () => {
    expect(() => buildBuildings([], flat)).not.toThrow()
  })

  it('skips a degenerate footprint rather than dropping the batch', () => {
    const bad: Building[] = [{ footprint: [v(0, 0), v(1, 0)], height: 9, kind: 'house' }]
    const { footprints } = buildBuildings(bad.concat(city(3)), flat)
    expect(footprints).toHaveLength(3)
  })
})
