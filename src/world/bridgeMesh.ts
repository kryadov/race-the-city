import * as THREE from 'three'
import type { ElevationProvider } from '../terrain/provider'
import type { Deck } from './bridge'
import { offsetsForPolyline, roadWidth, emitRibbon, ribbonMesh } from './roads'

const DECK_COLOR = 0x6e6f77
const RAIL_COLOR = 0x9aa0a8
const PIER_COLOR = 0x7b7d85
const RAIL_H = 1.0
const PIER_MIN = 2.0 // don't prop up a deck that is already on the ground

/**
 * A bridge: its deck at the profiled height, a railing down each side, and piers
 * where it stands clear of the ground.
 *
 * The deck's height comes from the profile rather than a fixed lift, so it meets
 * the approach roads at both ends and can actually be driven onto.
 */
export function buildBridges(decks: Deck[], provider: ElevationProvider): THREE.Object3D {
  const group = new THREE.Group()
  if (!decks.length) return group

  const deckPos: number[] = []
  const railPos: number[] = []
  const piers: { x: number; z: number; top: number; ground: number }[] = []

  for (const d of decks) {
    const pts = d.road.points
    const half = roadWidth(d.road.kind) / 2
    // Height by index — the ribbon walks the same points the profile was built on.
    const idx = new Map<number, number>()
    pts.forEach((p, i) => idx.set(p.x * 73856093 + p.z * 19349663, d.y[i]))
    const yOf = (v: { x: number; z: number }): number => idx.get(v.x * 73856093 + v.z * 19349663) ?? d.y[0]

    const sides = offsetsForPolyline(pts, half)
    emitRibbon(deckPos, sides, (v) => yOf(v))

    // Railings: a thin ribbon standing on each edge of the deck.
    for (const edge of ['left', 'right'] as const) {
      const line = sides.map((s) => s[edge])
      const rail = offsetsForPolyline(line, 0.09)
      emitRibbon(railPos, rail, (v) => yOf(v) + RAIL_H)
    }

    for (let i = 0; i < pts.length; i++) {
      const ground = provider.heightAt(pts[i].x, pts[i].z)
      if (d.y[i] - ground > PIER_MIN) piers.push({ x: pts[i].x, z: pts[i].z, top: d.y[i], ground })
    }
  }

  group.add(ribbonMesh(deckPos, DECK_COLOR))
  group.add(ribbonMesh(railPos, RAIL_COLOR))

  if (piers.length) {
    // One instanced draw for every pier in the city.
    const geo = new THREE.CylinderGeometry(0.55, 0.7, 1, 6)
    geo.translate(0, 0.5, 0) // stand on its base, so scaling y sets the height
    const mesh = new THREE.InstancedMesh(
      geo,
      new THREE.MeshStandardMaterial({ color: PIER_COLOR, flatShading: true }),
      piers.length,
    )
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const p = new THREE.Vector3()
    const s = new THREE.Vector3()
    piers.forEach((pier, i) => {
      p.set(pier.x, pier.ground, pier.z)
      s.set(1, pier.top - pier.ground, 1)
      mesh.setMatrixAt(i, m.compose(p, q, s))
    })
    mesh.instanceMatrix.needsUpdate = true
    group.add(mesh)
  }
  return group
}
