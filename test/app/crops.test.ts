import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  createCrops,
  collectCropSpots,
  cellKey,
  cellsInDisc,
  CELL_M,
  MOW_RADIUS,
  CROP_CAP,
  BALE_CAP,
} from '../../src/app/crops'
import { pointInPolygon } from '../../src/physics/collide'
import type { Surface, Vec2 } from '../../src/geo/types'
import type { ElevationProvider } from '../../src/terrain/provider'

/** A deterministic PRNG so counts and layout are stable across runs. */
function testRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const v = (x: number, z: number): Vec2 => ({ x, z })
/** A square ring `size` metres on a side, cornered at (ox, oz). */
const square = (size: number, ox = 0, oz = 0): Vec2[] =>
  [v(ox, oz), v(ox + size, oz), v(ox + size, oz + size), v(ox, oz + size)]
const farmland = (ring: Vec2[]): Surface => ({ kind: 'farmland', ring })

const flat: ElevationProvider = { heightAt: () => 0 }
const scene = (): THREE.Scene => new THREE.Scene()

describe('cellKey', () => {
  it('maps a world point to the integer cell it falls in', () => {
    expect(cellKey(0, 0, 5)).toBe('0:0')
    expect(cellKey(4.9, 4.9, 5)).toBe('0:0')
    expect(cellKey(5, 5, 5)).toBe('1:1')
    expect(cellKey(-1, -1, 5)).toBe('-1:-1') // floor, not truncate
  })

  it('groups every point within a cell to the same key', () => {
    expect(cellKey(12, 3, CELL_M)).toBe(cellKey(14, 1, CELL_M))
    expect(cellKey(12, 3, CELL_M)).not.toBe(cellKey(17, 3, CELL_M))
  })
})

describe('cellsInDisc', () => {
  it('includes the cell the combine is standing in', () => {
    expect(cellsInDisc(2.5, 2.5, MOW_RADIUS, CELL_M)).toContain('0:0')
  })

  it('reaches into neighbouring cells the swathe overlaps, but no further', () => {
    // A 4.5m radius disc centred in cell 0:0 reaches into the 8 surrounding cells
    // but nothing two cells away.
    const keys = cellsInDisc(2.5, 2.5, MOW_RADIUS, CELL_M)
    expect(keys).toContain('1:0')
    expect(keys).toContain('0:1')
    expect(keys).not.toContain('2:0') // 10m away — out of a 4.5m reach
  })

  it('is symmetric about the centre', () => {
    const keys = cellsInDisc(0, 0, MOW_RADIUS, CELL_M)
    expect(keys).toContain('-1:-1')
    expect(keys).toContain('0:0')
  })
})

describe('collectCropSpots', () => {
  it('clips every stalk inside the farmland polygon', () => {
    const ring = square(120)
    const spots = collectCropSpots([ring], testRng(1))
    expect(spots.length).toBeGreaterThan(0)
    for (const s of spots) expect(pointInPolygon(s.x, s.z, ring), `${s.x},${s.z}`).toBe(true)
  })

  it('stays under the global cap for an enormous field', () => {
    // 2km × 2km — a naive 2.2m grid would be ~800k stalks.
    const spots = collectCropSpots([square(2000)], testRng(2))
    expect(spots.length).toBeLessThanOrEqual(CROP_CAP)
  })

  it('is deterministic for a given seed', () => {
    const a = collectCropSpots([square(200)], testRng(3))
    const b = collectCropSpots([square(200)], testRng(3))
    expect(a.length).toBe(b.length)
    expect(a[0]).toEqual(b[0])
  })

  it('does nothing without a field', () => {
    expect(collectCropSpots([], testRng(4))).toEqual([])
  })
})

describe('createCrops', () => {
  const field = farmland(square(120))

  it('scatters standing crop, all inside the field', () => {
    const s = scene()
    const c = createCrops(s, [field], flat)
    expect(c.cropCount()).toBeGreaterThan(0)
    expect(c.standingCount()).toBe(c.cropCount()) // all standing to begin with
    for (const p of c.cropSpots()) expect(pointInPolygon(p.x, p.z, square(120)), `${p.x},${p.z}`).toBe(true)
    c.dispose()
  })

  it('only builds crop over farmland, ignoring other surface kinds', () => {
    const s = scene()
    const c = createCrops(s, [{ kind: 'meadow', ring: square(120) }], flat)
    expect(c.cropCount()).toBe(0)
    c.dispose()
  })

  it('does not touch the crop for any vehicle but the combine', () => {
    const s = scene()
    const c = createCrops(s, [field], flat)
    const before = c.standingCount()
    c.update(1, 60, 60, 'car')
    c.update(1, 60, 60, 'tractor')
    c.update(1, 60, 60, 'roller')
    expect(c.mownCellCount()).toBe(0)
    expect(c.standingCount()).toBe(before)
    c.dispose()
  })

  it('mows the cell under the combine, and it stays mown (idempotent)', () => {
    const s = scene()
    const c = createCrops(s, [field], flat)
    expect(c.isCellMown(60, 60)).toBe(false)
    c.update(1, 60, 60, 'combine')
    expect(c.isCellMown(60, 60)).toBe(true)
    expect(c.standingCount()).toBeLessThan(c.cropCount()) // some crop went to stubble

    // A second pass over the same spot changes nothing more.
    const cells = c.mownCellCount()
    const standing = c.standingCount()
    const bales = c.baleCount()
    c.update(1, 60, 60, 'combine')
    expect(c.mownCellCount()).toBe(cells)
    expect(c.standingCount()).toBe(standing)
    expect(c.baleCount()).toBe(bales)
    c.dispose()
  })

  it('leaves crop far from the combine standing', () => {
    const s = scene()
    const c = createCrops(s, [field], flat)
    c.update(1, 10, 10, 'combine') // mow one corner
    expect(c.isCellMown(10, 10)).toBe(true)
    expect(c.isCellMown(110, 110), 'the far corner must be untouched').toBe(false)
    c.dispose()
  })

  it('shrinks mown stalks in place (stubble), keeping them on their spot', () => {
    const s = scene()
    const c = createCrops(s, [field], flat)
    const cropMesh = (s.children[0] as THREE.Group).children
      .find((o) => (o as THREE.InstancedMesh).isInstancedMesh && (o as THREE.InstancedMesh).count === c.cropCount()) as THREE.InstancedMesh
    const before = new THREE.Vector3()
    const after = new THREE.Vector3()
    const posBefore = new THREE.Vector3()
    const posAfter = new THREE.Vector3()
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    // Snapshot instance 0 before and after mowing its cell.
    cropMesh.getMatrixAt(0, m)
    m.decompose(posBefore, q, before)
    const spot = c.cropSpots()[0]
    c.update(1, spot.x, spot.z, 'combine')
    cropMesh.getMatrixAt(0, m)
    m.decompose(posAfter, q, after)
    expect(after.y).toBeLessThan(before.y) // shorter
    expect(posAfter.x).toBeCloseTo(posBefore.x) // same spot
    expect(posAfter.z).toBeCloseTo(posBefore.z)
    c.dispose()
  })

  it('drops hay bales but never more than the cap', () => {
    const s = scene()
    // A big field, swept end to end so a great many cells are mown.
    const c = createCrops(s, [farmland(square(400))], flat)
    for (let x = 2; x < 400; x += CELL_M) {
      for (let z = 2; z < 400; z += CELL_M) c.update(1, x, z, 'combine')
    }
    expect(c.baleCount()).toBeGreaterThan(0) // some bales were left behind
    expect(c.baleCount()).toBeLessThanOrEqual(BALE_CAP)
    c.dispose()
  })

  it('is deterministic for a given field (fixed seed)', () => {
    const a = scene()
    const b = scene()
    const ca = createCrops(a, [field], flat)
    const cb = createCrops(b, [field], flat)
    expect(ca.cropCount()).toBe(cb.cropCount())
    expect(ca.cropSpots()[0]).toEqual(cb.cropSpots()[0])
    ca.dispose()
    cb.dispose()
  })

  it('removes its group and frees geometry on dispose', () => {
    const s = scene()
    const c = createCrops(s, [field], flat)
    expect(s.children.length).toBe(1)
    c.dispose()
    expect(s.children.length).toBe(0)
  })

  it('can be switched off', () => {
    const s = scene()
    const c = createCrops(s, [field], flat)
    const group = s.children[0] as THREE.Group
    c.setEnabled(false)
    expect(group.visible).toBe(false)
    c.setEnabled(true)
    expect(group.visible).toBe(true)
    c.dispose()
  })

  it('survives a field with no farmland (empty group, cheap update)', () => {
    const s = scene()
    const c = createCrops(s, [], flat)
    expect(c.cropCount()).toBe(0)
    c.update(1, 0, 0, 'combine') // no crop, no throw
    expect(c.mownCellCount()).toBe(0)
    c.dispose()
  })
})
