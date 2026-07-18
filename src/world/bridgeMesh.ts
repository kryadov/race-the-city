import * as THREE from 'three'
import type { Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import type { Deck } from './bridge'
import { offsetsForPolyline, roadWidth, emitRibbon, ribbonMesh } from './roads'

const DECK_COLOR = 0x6e6f77
const RAIL_COLOR = 0x9aa0a8
const PIER_COLOR = 0x7b7d85
const RAIL_H = 1.0
const PIER_MIN = 2.0 // don't prop up a deck that is already on the ground
/**
 * How thick the deck slab is. It used to be a single plane — a couple of pixels
 * edge-on — so a bridge seen from the side had no depth at all. Now the deck has
 * a drivable top at the profiled height and an underside this far below it, and
 * the piers stop at that underside instead of poking through the top.
 */
const DECK_THICKNESS = 0.6

/**
 * A vertical quad strip standing on a polyline: a wall from `yBot(i)` up to
 * `yTop(i)` at each point. The ribbon helper only lays surfaces flat; a fascia
 * down the deck's side and a railing standing on its edge both need a wall, and
 * a railing drawn as a flat ribbon 1m up simply hung there in mid-air.
 */
function emitWall(
  out: number[],
  line: Vec2[],
  yBot: (i: number) => number,
  yTop: (i: number) => number,
): void {
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]
    const b = line[i + 1]
    const ab = yBot(i)
    const at = yTop(i)
    const bb = yBot(i + 1)
    const bt = yTop(i + 1)
    out.push(a.x, ab, a.z, a.x, at, a.z, b.x, bt, b.z)
    out.push(a.x, ab, a.z, b.x, bt, b.z, b.x, bb, b.z)
  }
}

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
    // By index, not by coordinate: the ribbon's vertices are offset out to the
    // road's edges, so looking the height up by position never matches and the
    // whole deck comes out flat at its first point.
    const sides = offsetsForPolyline(pts, half)

    // The slab's underside sits DECK_THICKNESS below the drivable top, but never
    // below the ground it spans: at the abutments the deck settles onto the
    // embankment, so we clamp there and the slab tapers to nothing rather than
    // burying its underside in the hillside. Sampled once and reused for the
    // fascia and the piers.
    const ground = pts.map((p) => provider.heightAt(p.x, p.z))
    const under = d.y.map((y, i) => Math.max(y - DECK_THICKNESS, ground[i]))

    // A solid slab: drivable top, underside, and a fascia down each edge — so the
    // deck reads as real depth instead of a plane a couple of pixels thick.
    emitRibbon(deckPos, sides, (_v, i) => d.y[i])
    emitRibbon(deckPos, sides, (_v, i) => under[i])
    emitWall(deckPos, sides.map((s) => s.left), (i) => under[i], (i) => d.y[i])
    emitWall(deckPos, sides.map((s) => s.right), (i) => under[i], (i) => d.y[i])

    // Railings: a wall standing ON each deck edge, base at deck level rising to
    // RAIL_H. As a flat ribbon they floated a metre above the deck instead.
    for (const edge of ['left', 'right'] as const) {
      const line = sides.map((s) => s[edge])
      emitWall(railPos, line, (i) => d.y[i], (i) => d.y[i] + RAIL_H)
    }

    for (let i = 0; i < pts.length; i++) {
      // Pier TOP at the deck's underside, not its surface: a pier reaching the
      // profiled height poked up through the deck. It stops beneath the slab and
      // carries it from below, and only where the deck stands clear of the ground.
      const top = d.y[i] - DECK_THICKNESS
      if (top - ground[i] > PIER_MIN) piers.push({ x: pts[i].x, z: pts[i].z, top, ground: ground[i] })
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
