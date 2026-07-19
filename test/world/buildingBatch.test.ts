import { describe, it, expect, beforeAll } from 'vitest'
import * as THREE from 'three'
import { buildBuildings } from '../../src/world/buildings'
import { storeysIn } from '../../src/world/facadeUv'
import { ROOF_UV, STOREYS_PER_TILE } from '../../src/world/facade'
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

describe('no windows in the dirt on a slope', () => {
  // The bug: a facade's windows are drawn upward from a single ground level, but
  // a footprint on a slope stands over ground of varying height. Seated at the
  // average grade, every window over the higher, uphill side glowed from inside
  // the earth. Seated at the highest grade, the whole grid clears the ground —
  // this locks that.
  const ramp = { heightAt: (x: number) => x * 0.5 } // ground climbs west→east

  /** The one wall mesh: not the instanced doors/signs, and carrying facade UVs. */
  function wallMesh(root: THREE.Object3D): THREE.Mesh {
    let wall: THREE.Mesh | undefined
    root.traverse((c) => {
      if ((c as THREE.InstancedMesh).isInstancedMesh) return
      const g = (c as THREE.Mesh).geometry
      if (g?.attributes?.uv) wall = c as THREE.Mesh
    })
    if (!wall) throw new Error('no wall mesh with facade UVs')
    return wall
  }

  it('seats the whole window grid above the highest terrain under the footprint', () => {
    const b: Building = {
      footprint: [v(0, 0), v(40, 0), v(40, 12), v(0, 12)], // spans a 20m rise
      height: 15,
      kind: 'apartments',
    }
    const pos = wallMesh(buildBuildings([b], ramp).mesh).geometry.attributes.position
    let topY = -Infinity
    let baseY = Infinity
    for (let i = 0; i < pos.count; i++) {
      topY = Math.max(topY, pos.getY(i))
      baseY = Math.min(baseY, pos.getY(i))
    }
    // The facade's v=0 ground floor sits `height` below the roofline; every
    // window row stacks up from there.
    const groundFloorY = topY - b.height

    // No point of the terrain under the footprint pokes above the ground floor,
    // so no window row is ever buried — not even on the uphill wall.
    for (let x = 0; x <= 40; x++) {
      expect(ramp.heightAt(x), `terrain at x=${x} vs ground floor`).toBeLessThanOrEqual(groundFloorY + 1e-6)
    }
    // Still seated: the base reaches down past the lowest corner, not floating.
    expect(baseY).toBeLessThanOrEqual(ramp.heightAt(0))
  })

  it('makes the plinth below the ground floor a solid base, not window rows', () => {
    // A big low footprint on a slope: the base drops far below the ground floor,
    // so the plinth would stripe with repeated window rows if it kept counting
    // storeys downward into negative v. It must read as one plain surface.
    const b: Building = {
      footprint: [v(0, 0), v(60, 0), v(60, 40), v(0, 40)], // 30m rise under it
      height: 12,
      kind: 'apartments',
    }
    const geo = wallMesh(buildBuildings([b], ramp).mesh).geometry
    const pos = geo.attributes.position
    const uv = geo.attributes.uv

    let topY = -Infinity
    for (let i = 0; i < pos.count; i++) topY = Math.max(topY, pos.getY(i))
    const groundY = topY - b.height // the facade's v=0 ground floor

    let plinthChecked = 0
    let facadeTop = false
    const roofline = storeysIn(b.height) / STOREYS_PER_TILE // v at the eaves
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      const vv = uv.getY(i)
      if (y < groundY - 1e-3) {
        // Below the ground floor: the plain sliver, never a window row.
        expect(uv.getX(i), `plinth u at y=${y.toFixed(2)}`).toBeCloseTo(ROOF_UV.u)
        expect(vv, `plinth v at y=${y.toFixed(2)}`).toBeCloseTo(ROOF_UV.v)
        plinthChecked++
      } else if (Math.abs(vv - roofline) < 1e-4) {
        facadeTop = true // a wall vertex still climbing the storey grid above
      }
    }
    expect(plinthChecked, 'the sloped base should have plinth vertices').toBeGreaterThan(0)
    expect(facadeTop, 'the facade above must still carry the storey grid').toBe(true)
  })
})
