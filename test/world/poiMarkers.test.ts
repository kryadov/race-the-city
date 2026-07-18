import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildPoiMarkers } from '../../src/world/poiMarkers'
import type { PoiMarker } from '../../src/world/poiMarkers'

const flat = { heightAt: () => 0 }
const poi = (x: number, z: number, kind: PoiMarker['kind']): PoiMarker => ({ x, z, kind })

/** Sum the instance counts of every instanced mesh whose name matches. */
function countInstances(o: THREE.Object3D, pred: (name: string) => boolean): number {
  let total = 0
  o.traverse((c) => {
    if (c instanceof THREE.InstancedMesh && pred(c.name)) total += c.count
  })
  return total
}

function findMesh(o: THREE.Object3D, name: string): THREE.InstancedMesh | null {
  let found: THREE.InstancedMesh | null = null
  o.traverse((c) => {
    if (c instanceof THREE.InstancedMesh && c.name === name) found = c
  })
  return found
}

const colorOf = (mesh: THREE.InstancedMesh): THREE.Color =>
  (mesh.material as THREE.MeshStandardMaterial).color

describe('poi markers', () => {
  it('builds nothing for a city with no points of interest', () => {
    expect(buildPoiMarkers([], flat).children).toHaveLength(0)
  })

  it('stands one marker per input, café and fuel alike', () => {
    const pois = [
      poi(0, 0, 'cafe'),
      poi(10, 0, 'fuel'),
      poi(0, 10, 'cafe'),
      poi(20, 20, 'fuel'),
      poi(-5, 3, 'cafe'),
    ]
    const g = buildPoiMarkers(pois, flat)
    // one post, and one panel, for every point of interest given
    expect(countInstances(g, (n) => n === 'poi-posts')).toBe(pois.length)
    expect(countInstances(g, (n) => n.endsWith('panel'))).toBe(pois.length)
  })

  it('splits panels between the two kinds by count', () => {
    const pois = [poi(0, 0, 'cafe'), poi(10, 0, 'fuel'), poi(0, 10, 'cafe'), poi(20, 20, 'cafe')]
    const g = buildPoiMarkers(pois, flat)
    expect(findMesh(g, 'poi-cafe-panel')!.count).toBe(3)
    expect(findMesh(g, 'poi-fuel-panel')!.count).toBe(1)
  })

  it('distinguishes a café from a fuel station by panel colour', () => {
    const g = buildPoiMarkers([poi(0, 0, 'cafe'), poi(5, 0, 'fuel')], flat)
    const cafe = findMesh(g, 'poi-cafe-panel')
    const fuel = findMesh(g, 'poi-fuel-panel')
    expect(cafe, 'a café panel exists').not.toBeNull()
    expect(fuel, 'a fuel panel exists').not.toBeNull()

    const c = colorOf(cafe!)
    const f = colorOf(fuel!)
    expect(c.getHex()).not.toBe(f.getHex())
    // café reads warm (more red than green); fuel reads green (more green than red)
    expect(c.r, 'café is warm').toBeGreaterThan(c.g)
    expect(f.g, 'fuel is green').toBeGreaterThan(f.r)
  })

  it('gives the panel glyph a day glow, so it reads at a distance', () => {
    const g = buildPoiMarkers([poi(0, 0, 'cafe')], flat)
    const glyph = findMesh(g, 'poi-cafe-glyph')!
    const mat = glyph.material as THREE.MeshStandardMaterial
    expect(mat.emissiveIntensity).toBeGreaterThan(0)
    expect(mat.emissive.getHex(), 'the glyph actually emits a colour').not.toBe(0x000000)
  })

  it('sits every marker on the terrain, not at sea level', () => {
    const hill = { heightAt: () => 40 }
    const g = buildPoiMarkers([poi(0, 0, 'cafe'), poi(30, 15, 'fuel')], hill)
    const b = new THREE.Box3().setFromObject(g)
    // the post base rests on the ground (40), and the sign stands well above it
    expect(b.min.y, 'post base on the ground').toBeGreaterThan(39.9)
    expect(b.min.y, 'not floating above it').toBeLessThan(40.1)
    expect(b.max.y, 'the sign stands up off the ground').toBeGreaterThan(42)
  })

  it('sits on a slope where the surface actually is', () => {
    // A sloped provider: two markers at different x land at different heights.
    const slope = { heightAt: (x: number) => x * 0.5 }
    const g = buildPoiMarkers([poi(100, 0, 'cafe')], slope)
    const b = new THREE.Box3().setFromObject(g)
    expect(b.min.y, 'lifted to the slope height at x=100').toBeGreaterThan(49.9)
  })

  it('draws a fixed number of meshes however many markers there are', () => {
    // Instancing: the mesh count depends on the kinds present, not the marker
    // count. Both builds have both kinds, so both are posts + 2×(panel+glyph).
    const few = buildPoiMarkers([poi(0, 0, 'cafe'), poi(5, 0, 'fuel')], flat).children.length
    const many = buildPoiMarkers(
      Array.from({ length: 60 }, (_, i): PoiMarker => poi(i * 12, 0, i % 2 ? 'fuel' : 'cafe')),
      flat,
    ).children.length
    expect(many).toBe(few)
    expect(many).toBeLessThan(60) // nowhere near one mesh per marker
  })
})
