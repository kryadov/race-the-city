import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createTraffic } from '../../src/app/traffic'
import { createPedestrians } from '../../src/app/pedestrians'
import { buildEntrances } from '../../src/world/entrances'
import type { Building, Road, Vec2 } from '../../src/geo/types'

const flat = { heightAt: () => 0 }
const v = (x: number, z: number): Vec2 => ({ x, z })
const roads: Road[] = [
  { points: [v(-400, 0), v(0, 0), v(400, 0)], kind: 'residential' },
  { points: [v(0, -400), v(0, 0), v(0, 400)], kind: 'residential' },
]
const buildings: Building[] = [
  { footprint: [v(20, 20), v(40, 20), v(40, 40), v(20, 40)], height: 12, kind: 'retail' },
]

/**
 * three's shader does `vColor *= color` under vertexColors, reading the
 * geometry's colour attribute. An instanced box hasn't got one, so WebGL feeds
 * zeroes and every instance renders black — before instanceColor is even
 * applied. It is invisible to every other kind of test: the colours are set, the
 * meshes are there, and the whole street comes out black.
 */
function auditInstanceColours(root: THREE.Object3D, label: string): number {
  let audited = 0
  root.traverse((o) => {
    const im = o as THREE.InstancedMesh
    if (!im.isInstancedMesh || !im.instanceColor) return
    audited++
    const mats = Array.isArray(im.material) ? im.material : [im.material]
    for (const m of mats) {
      expect(
        (m as THREE.MeshStandardMaterial).vertexColors,
        `${label}: instance colours + vertexColors renders black`,
      ).toBe(false)
    }
    // and the colours themselves must not be black
    const c = new THREE.Color()
    let lit = 0
    for (let i = 0; i < im.count; i++) {
      im.getColorAt(i, c)
      if (c.r + c.g + c.b > 0.05) lit++
    }
    expect(lit, `${label}: every instance colour is black`).toBeGreaterThan(0)
  })
  return audited
}

describe('instance colours are not black', () => {
  it('traffic', () => {
    const scene = new THREE.Scene()
    createTraffic(scene, roads, flat, () => 0.5)
    expect(auditInstanceColours(scene, 'traffic')).toBeGreaterThan(0)
  })

  it('pedestrians', () => {
    const scene = new THREE.Scene()
    createPedestrians(scene, roads, flat, () => 0.5)
    expect(auditInstanceColours(scene, 'pedestrians')).toBeGreaterThan(0)
  })

  it('doors and signs', () => {
    const scene = new THREE.Scene()
    scene.add(buildEntrances(buildings, flat))
    expect(auditInstanceColours(scene, 'entrances')).toBeGreaterThan(0)
  })
})

describe('traffic variety', () => {
  it('is not all one colour', () => {
    const scene = new THREE.Scene()
    createTraffic(scene, roads, flat, Math.random)
    const body = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh
    const seen = new Set<string>()
    const c = new THREE.Color()
    for (let i = 0; i < body.count; i++) {
      body.getColorAt(i, c)
      seen.add(c.getHexString())
    }
    expect(seen.size, 'a street of identical cars').toBeGreaterThan(2)
  })

  it('is not all one shape', () => {
    // saloons, hatchbacks, vans, estates — stretched out of the one box
    const scene = new THREE.Scene()
    const t = createTraffic(scene, roads, flat, Math.random)
    t.update(1 / 60, 0, 0, 0)
    const body = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh
    const m = new THREE.Matrix4()
    const s = new THREE.Vector3()
    const shapes = new Set<string>()
    for (let i = 0; i < body.count; i++) {
      body.getMatrixAt(i, m)
      m.decompose(new THREE.Vector3(), new THREE.Quaternion(), s)
      shapes.add(`${s.x.toFixed(2)}x${s.y.toFixed(2)}`)
    }
    expect(shapes.size, 'every car the same size and shape').toBeGreaterThan(1)
  })
})
