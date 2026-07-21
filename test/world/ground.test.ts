import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildGround, SURFACE_COLORS } from '../../src/world/ground'
import { FlatProvider } from '../../src/terrain/flat'
import type { Surface, Vec2 } from '../../src/geo/types'

const provider = new FlatProvider()
const HALF = 100
const SEGMENTS = 20 // 21×21 grid, one vertex every 10m across [-100, 100]

/** A closed axis-aligned rectangle ring covering [x0,x1] × [z0,z1]. */
function rect(x0: number, z0: number, x1: number, z1: number): Vec2[] {
  return [
    { x: x0, z: z0 },
    { x: x1, z: z0 },
    { x: x1, z: z1 },
    { x: x0, z: z1 },
  ]
}

const colorOf = (mesh: THREE.Mesh): THREE.BufferAttribute =>
  mesh.geometry.getAttribute('color') as THREE.BufferAttribute

/** Every distinct vertex colour in the ground mesh, as float-triple keys. */
function distinctColors(mesh: THREE.Mesh): Set<string> {
  const col = colorOf(mesh)
  const seen = new Set<string>()
  for (let i = 0; i < col.count; i++) {
    seen.add(`${col.getX(i).toFixed(4)},${col.getY(i).toFixed(4)},${col.getZ(i).toFixed(4)}`)
  }
  return seen
}

/** True when some vertex carries exactly this colour (Float32 tolerance). */
function hasColor(mesh: THREE.Mesh, c: THREE.Color): boolean {
  const col = colorOf(mesh)
  const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-4
  for (let i = 0; i < col.count; i++) {
    if (near(col.getX(i), c.r) && near(col.getY(i), c.g) && near(col.getZ(i), c.b)) return true
  }
  return false
}

describe('buildGround land-use surfaces', () => {
  it('paints each land-use kind as its own distinct tint', () => {
    // Four non-overlapping vertical bands, one per surface kind, with bare ground
    // in the gaps between them.
    const surfaces: Surface[] = [
      { kind: 'farmland', ring: rect(-90, -90, -60, 90) },
      { kind: 'meadow', ring: rect(-40, -90, -20, 90) },
      { kind: 'orchard', ring: rect(10, -90, 30, 90) },
      { kind: 'residential', ring: rect(60, -90, 90, 90) },
    ]
    const mesh = buildGround(provider, HALF, [], surfaces, SEGMENTS)

    for (const kind of ['farmland', 'meadow', 'orchard', 'residential'] as const) {
      expect(hasColor(mesh, SURFACE_COLORS[kind])).toBe(true)
    }
    // base ground + four surface tints = five distinct colours, all separate.
    expect(distinctColors(mesh).size).toBe(5)
  })

  it('lets a surface tint override the park green where they overlap', () => {
    const ring = rect(-90, -90, 90, 90) // one region, tagged both ways
    const green: Vec2[][] = [ring]
    const surfaces: Surface[] = [{ kind: 'orchard', ring }]
    const mesh = buildGround(provider, HALF, green, surfaces, SEGMENTS)

    // Surfaces are tested before green, so the more specific orchard tint wins and
    // the generic park GREEN never lands on a vertex the orchard already claimed.
    expect(hasColor(mesh, SURFACE_COLORS.orchard)).toBe(true)
    const green4c42 = new THREE.Color(0x4c7a42)
    expect(hasColor(mesh, green4c42)).toBe(false)
  })

  it('is bare single-colour ground when given no green and no surfaces', () => {
    // Also pins the default: surfaces is optional, so the day-one call still works.
    const mesh = buildGround(provider, HALF, [], [], SEGMENTS)
    expect(distinctColors(mesh).size).toBe(1)
    for (const c of Object.values(SURFACE_COLORS)) expect(hasColor(mesh, c)).toBe(false)
  })

  it('overrides only the surface kinds it is handed, leaving the rest at their base tint', () => {
    const surfaces: Surface[] = [
      { kind: 'farmland', ring: rect(-90, -90, -40, 90) },
      { kind: 'meadow', ring: rect(-20, -90, 20, 90) },
      { kind: 'orchard', ring: rect(50, -90, 90, 90) },
    ]
    const winterFarm = new THREE.Color(0x9c8d6e) // season.ts winter crop
    const winterMeadow = new THREE.Color(0x83836e) // season.ts winter pasture
    const mesh = buildGround(provider, HALF, [], surfaces, SEGMENTS, new THREE.Color(0x4c7a42), {
      farmland: winterFarm,
      meadow: winterMeadow,
    })
    // farmland & meadow wear the winter overrides...
    expect(hasColor(mesh, winterFarm)).toBe(true)
    expect(hasColor(mesh, winterMeadow)).toBe(true)
    expect(hasColor(mesh, SURFACE_COLORS.farmland)).toBe(false) // base summer khaki gone
    expect(hasColor(mesh, SURFACE_COLORS.meadow)).toBe(false)
    // ...but orchard, not overridden, keeps its year-round tint.
    expect(hasColor(mesh, SURFACE_COLORS.orchard)).toBe(true)
  })

  it('paints park lawns the seasonal grass colour it is given', () => {
    const green: Vec2[][] = [rect(-90, -90, 90, 90)]
    const summer = new THREE.Color(0x4c7a42) // the default (summer) park green
    const autumn = new THREE.Color(0x7d7a45) // season.ts autumn grass

    // Default: no grass argument → the year-round summer green, unchanged.
    const dflt = buildGround(provider, HALF, green, [], SEGMENTS)
    expect(hasColor(dflt, summer)).toBe(true)
    expect(hasColor(dflt, autumn)).toBe(false)

    // Given autumn's grass, the park wears it instead of the summer green.
    const fall = buildGround(provider, HALF, green, [], SEGMENTS, autumn)
    expect(hasColor(fall, autumn)).toBe(true)
    expect(hasColor(fall, summer)).toBe(false)
  })

  it('adds no extra draw — every tint rides the one ground mesh', () => {
    // The whole point of vertex-colour tinting: still a single mesh, one draw,
    // whatever land-use areas are painted on it.
    const surfaces: Surface[] = [
      { kind: 'farmland', ring: rect(-90, -90, -60, 90) },
      { kind: 'residential', ring: rect(60, -90, 90, 90) },
    ]
    const mesh = buildGround(provider, HALF, [rect(-40, -90, -20, 90)], surfaces, SEGMENTS)
    expect(mesh).toBeInstanceOf(THREE.Mesh)
    expect((mesh.material as THREE.MeshStandardMaterial).vertexColors).toBe(true)
  })
})
