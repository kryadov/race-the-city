import * as THREE from 'three'
import type { Road, Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import { buildRoadGraph, nextNode, type RoadGraph } from '../world/roadGraph'
import { pointInPolygon, type Circle } from '../physics/collide'
import { season, type SeasonName } from '../world/season'

/** People at 'normal': ambience, not a crowd to thread. */
const COUNT = 22
/**
 * Recycled and respawned beyond the fog (300..900m), so you never see one
 * blink out or appear. They're small, but a figure vanishing at 260m is still a
 * figure vanishing.
 */
const FAR = 620
const SPAWN_MIN = 380
const SPAWN_MAX = 600
const KERB = 4.4 // metres off the centreline — the pavement, not the carriageway
const MAX_HOPS = 8
const SPEED_MIN = 1.1 // m/s: a walk
const SPEED_MAX = 1.8

/**
 * Ramming knockback. When the player's car clips someone (see `shove`), they
 * take a displacement off the pavement that eases back to zero over the next
 * second or so — knocked aside, then they carry on from where they staggered
 * to. KNOCK_DECAY is the framerate-independent relax rate (e^-k*t: k=5 is mostly
 * gone in ~0.6s), MAX_KNOCK caps the offset so a hit only shoves them clear, and
 * SHOVE_REACH is how close to the impact a walker has to be to feel it.
 */
const KNOCK_DECAY = 5
const MAX_KNOCK = 2.5
const SHOVE_REACH = 4

const SHIRTS = [0xd0453f, 0x3a6ea5, 0x3f8f5e, 0xd8b23a, 0x8a4f9e, 0xdedad2, 0x39424d]
// Its own palette, not SHIRTS: skirts read as separate garments, but pulled
// from the same muted, low-saturation family so a mixed crowd doesn't look
// like two unrelated colour schemes standing next to each other.
const SKIRTS = [0xa8324f, 0x2e4d7a, 0x3a6b4a, 0xc27a2e, 0x5c3a75, 0x36404a]
const HAIR = [0x1c1712, 0x3b2a1e, 0x6b4423, 0xd9c27a, 0x8a4b32]
// Roughly a third to a half of the crowd, per the brief.
const GIRL_CHANCE = 0.42

// Where winter's layers pull the palette: a warm orange (THREE hue units, 0=red,
// 1/3=green, 2/3=blue). Coats and scarves read warm, so cool shirts get dragged
// part of the way here rather than staying summer-crisp.
const WARM_HUE = 0.08

/**
 * The crowd dresses for the date — the same season the trees and ground already
 * read from world/season.ts, only shifting *clothes* rather than leaves. Each
 * season re-tones a garment by three amounts, applied to its HSL:
 *  - `dl` lightness — how much lighter (summer tees) or darker (winter coats);
 *  - `ds` saturation — summer lifts it, winter mutes it toward grey wool;
 *  - `warm` — how far, 0..1, the hue is dragged toward WARM_HUE, so a navy shirt
 *    becomes a warmer winter slate instead of a crisp summer blue.
 * Summer is the bright, light extreme; winter the dark, muted, faintly-warm one;
 * spring and autumn sit between (spring light and clean, autumn dim and warming).
 */
interface Wear {
  dl: number
  ds: number
  warm: number
}
const WEAR: Record<SeasonName, Wear> = {
  summer: { dl: 0.1, ds: 0.06, warm: 0 }, // t-shirts in the sun: bright and light
  spring: { dl: 0.05, ds: 0.03, warm: 0 }, // light layers, nothing heavy yet
  autumn: { dl: -0.07, ds: -0.03, warm: 0.15 }, // drawing in: a touch dark, warming
  winter: { dl: -0.17, ds: -0.14, warm: 0.3 }, // coats: markedly darker, muted, warm
}

const clampUnit = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)

/**
 * Re-tone one packed 0xRRGGBB garment colour for a season. Pure and
 * deterministic — the same colour and season in give the same colour out — so
 * the whole seasonal mapping unit-tests without a scene, and it runs once per
 * seeded palette pick at build time, never per frame.
 */
export function dressForSeason(hex: number, name: SeasonName): number {
  const w = WEAR[name]
  const c = new THREE.Color(hex)
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl)
  // Drag the hue toward warm along the shorter arc round the wheel, so a cool
  // colour warms rather than spinning off the long way toward cyan.
  let dh = WARM_HUE - hsl.h
  if (dh > 0.5) dh -= 1
  else if (dh < -0.5) dh += 1
  c.setHSL((hsl.h + dh * w.warm + 1) % 1, clampUnit(hsl.s + w.ds), clampUnit(hsl.l + w.dl))
  return c.getHex()
}

export interface Pedestrians {
  update(dt: number, camX: number, camZ: number): void
  /** Where they are, for the player to collide with. */
  obstacles(): Circle[]
  /**
   * Knock anyone near (x, z) back along (dirX, dirZ) — the player ramming them.
   * The shove is a displacement that decays to zero over the next second or so
   * (see KNOCK_DECAY), so they stagger aside then walk on from there. Everyone
   * within SHOVE_REACH feels it; the direction is normalised, `strength` is the
   * metres of offset applied (clamped to MAX_KNOCK).
   */
  shove(x: number, z: number, dirX: number, dirZ: number, strength: number): void
  setEnabled(on: boolean): void
  dispose(): void
}

interface Walker {
  at: number
  to: number
  s: number
  speed: number
  side: number // which side of the way they walk
  phase: number // so they don't all bob in step
  /** Ramming knockback: a displacement (metres) off the pavement, added to the
   *  drawn position and eased back to zero each frame. Zero when undisturbed. */
  kx: number
  kz: number
}

function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * People walking the streets.
 *
 * They use the same road graph as the traffic, but walk the pavement — offset
 * from the centreline, on either side. Footways are included here and excluded
 * from the driving graph, which is exactly the difference between the two.
 *
 * They are ambience: no collision, no errands, and they walk through each other.
 */
export function createPedestrians(
  scene: THREE.Scene,
  roads: Road[],
  provider: ElevationProvider,
  rand: () => number = Math.random,
  count = COUNT,
  water: Vec2[][] = [],
  // The city's latitude, only used to pick the season (via season.ts, which
  // flips the calendar south of the equator). Defaults to 0 — treated as
  // northern — so the seasonal wardrobe works with no wiring; main.ts has
  // `center.lat` to hand (it already passes it to buildGreenery) and should
  // forward it here as a follow-up so Sydney dresses for summer in January.
  lat = 0,
): Pedestrians {
  const group = new THREE.Group()
  scene.add(group)
  // Dress the whole crowd for today's season: recolour each garment palette once,
  // here, so it's a pure instanceColor swap with no per-frame cost. Hair keeps its
  // natural colours (a season doesn't change what grows on your head); hats are a
  // geometry job left for later.
  const szn = season(new Date(), lat).name
  const seasonShirts = SHIRTS.map((c) => dressForSeason(c, szn))
  const seasonSkirts = SKIRTS.map((c) => dressForSeason(c, szn))
  // Trousers are one shared material, not per-instance, so the season shifts them
  // as a batch — darker and warmer in winter, a lighter summer tone — for free.
  const legTone = dressForSeason(0x33363d, szn)
  // Footways included: this is where people belong and cars don't.
  const graph: RoadGraph = buildRoadGraph(roads.map((r) => (r.kind === 'path' ? { ...r, kind: 'service' as const } : r)))
  const rng = makeRng(0xbeef11)
  const walkers: Walker[] = []
  // True where (x,z) falls inside a lake/river outline — a walker standing there
  // would be down on the bed under the surface, so we steer them off it or hide
  // them (in the walk loop below).
  const overWater = (x: number, z: number): boolean => {
    for (const ring of water) if (ring.length >= 3 && pointInPolygon(x, z, ring)) return true
    return false
  }

  const spawn = (near: { x: number; z: number } | null): Walker | null => {
    if (!graph.nodes.length) return null
    let at = Math.floor(rand() * graph.nodes.length)
    if (near) {
      let found = false
      for (let i = 0; i < 40; i++) {
        const c = Math.floor(rand() * graph.nodes.length)
        const d = Math.hypot(graph.nodes[c].x - near.x, graph.nodes[c].z - near.z)
        if (d > SPAWN_MIN && d < SPAWN_MAX) {
          at = c
          found = true
          break
        }
      }
      if (!found) return null // nowhere out of sight; leave them where they are
    }
    const to = nextNode(graph, -1, at, rng)
    if (to === at) return null
    return {
      at,
      to,
      s: 0,
      speed: SPEED_MIN + rand() * (SPEED_MAX - SPEED_MIN),
      side: rand() < 0.5 ? 1 : -1,
      phase: rand() * Math.PI * 2,
      kx: 0,
      kz: 0,
    }
  }

  for (let i = 0; i < count; i++) {
    const w = spawn(null)
    if (w) walkers.push(w)
  }

  // One instanced draw per part for everyone on the street.
  const torsoGeo = new THREE.BoxGeometry(0.4, 0.62, 0.26)
  torsoGeo.translate(0, 1.12, 0)
  const headGeo = new THREE.SphereGeometry(0.15, 6, 5)
  headGeo.translate(0, 1.58, 0)
  // Limbs pivot at the hip and shoulder, so the geometry hangs below its origin.
  const legGeo = new THREE.BoxGeometry(0.15, 0.8, 0.16)
  legGeo.translate(0, -0.4, 0)
  const armGeo = new THREE.BoxGeometry(0.12, 0.55, 0.13)
  armGeo.translate(0, -0.28, 0)
  // A truncated cone at the hip: narrower at the waist, flared at the hem.
  // It's rigid with the torso (not the legs), so it doesn't swing when walking
  // — real skirts don't swing with the stride, they hang from the waist.
  // Sized to fully enclose the legs' hip pivot (0.72) at both extremes of the
  // walk-cycle swing, so no thigh pokes out from under it; only at the far end
  // of a stride does a shin show below the hem, same as a real skirt.
  const skirtGeo = new THREE.CylinderGeometry(0.19, 0.27, 0.4, 8)
  skirtGeo.translate(0, 0.75, 0)
  // A ponytail: the one shape cue that reads as "hair" rather than "bald head"
  // at 30m in a moving car, which is the whole point of adding it.
  const hairGeo = new THREE.CylinderGeometry(0.05, 0.11, 0.34, 6)
  hairGeo.translate(-0.13, 1.42, 0)

  const n = walkers.length || 1
  // Instance colours only — see the note by the traffic's materials: vertexColors
  // on a geometry with no colour attribute paints every instance black.
  const bodies = new THREE.InstancedMesh(torsoGeo, new THREE.MeshStandardMaterial({ flatShading: true }), n)
  const heads = new THREE.InstancedMesh(
    headGeo,
    new THREE.MeshStandardMaterial({ color: 0xe0ac69, flatShading: true }),
    n,
  )
  const legs = new THREE.InstancedMesh(legGeo, new THREE.MeshStandardMaterial({ color: legTone, flatShading: true }), n * 2)
  const arms = new THREE.InstancedMesh(armGeo, new THREE.MeshStandardMaterial({ flatShading: true }), n * 2)
  // Only girls get a skirt or hair, but everyone gets an instance slot in both
  // meshes regardless — one InstancedMesh per part for the whole crowd, always,
  // so draw calls stay fixed. The walkers who don't have the part just get an
  // instance collapsed to nothing (see `hidden` in the walk loop below).
  const skirts = new THREE.InstancedMesh(skirtGeo, new THREE.MeshStandardMaterial({ flatShading: true }), n)
  const hair = new THREE.InstancedMesh(hairGeo, new THREE.MeshStandardMaterial({ flatShading: true }), n)
  group.add(bodies, heads, legs, arms, skirts, hair)
  // Who's a girl is fixed per crowd slot from a dedicated seed, not drawn from
  // `rand` (Math.random in production) — the same way world/greenery.ts seeds
  // its RNG, so the split can't reshuffle between reloads, browsers, or when a
  // walker respawns off in the distance and a new one takes its slot.
  const lookRng = makeRng(0x51a1c5)
  const isGirl: boolean[] = Array.from({ length: n }, () => lookRng() < GIRL_CHANCE)
  // three computes an InstancedMesh's bounding sphere on first use and never
  // again, so once these drive away from it the whole batch gets frustum-culled
  // as one — they blink in and out depending on where you look. They are always
  // near the player anyway, so simply never cull them.
  group.children.forEach((c) => (c.frustumCulled = false))

  // Draw the garment colours from `lookRng`, the same seeded stream as the girl
  // split — not from `rand` (Math.random in production) — so a given crowd slot
  // wears the same seasonal outfit across reloads, browsers and respawns.
  const col = new THREE.Color()
  walkers.forEach((_, i) => {
    col.setHex(seasonShirts[Math.floor(lookRng() * seasonShirts.length)])
    bodies.setColorAt(i, col)
    arms.setColorAt(i * 2, col) // sleeves match the shirt
    arms.setColorAt(i * 2 + 1, col)
    if (isGirl[i]) {
      col.setHex(seasonSkirts[Math.floor(lookRng() * seasonSkirts.length)])
      skirts.setColorAt(i, col)
      col.setHex(HAIR[Math.floor(lookRng() * HAIR.length)])
      hair.setColorAt(i, col)
    }
  })
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true
  if (arms.instanceColor) arms.instanceColor.needsUpdate = true
  if (skirts.instanceColor) skirts.instanceColor.needsUpdate = true
  if (hair.instanceColor) hair.instanceColor.needsUpdate = true

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const pos = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)
  const up = new THREE.Vector3(0, 1, 0)
  const right = new THREE.Vector3(0, 0, 1) // limbs swing about the body's z
  const limbQ = new THREE.Quaternion()
  const mLimb = new THREE.Matrix4()
  const off = new THREE.Matrix4()
  const hip = new THREE.Vector3()
  // Collapses an instance to a zero-size point: how a walker who hasn't got a
  // given part — a boy with no skirt, no ponytail — gets hidden without a
  // second InstancedMesh or a per-instance visibility flag, neither of which
  // exist on InstancedMesh.
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0)
  let clock = 0

  const solidAt: Circle[] = []
  // Collapse every part of walker i to nothing — used when both pavements of
  // their road are over water (a causeway or bridge deck), so rather than tramp
  // across the bottom they simply aren't drawn there.
  const hide = (i: number): void => {
    bodies.setMatrixAt(i, hidden)
    heads.setMatrixAt(i, hidden)
    skirts.setMatrixAt(i, hidden)
    hair.setMatrixAt(i, hidden)
    legs.setMatrixAt(i * 2, hidden)
    legs.setMatrixAt(i * 2 + 1, hidden)
    arms.setMatrixAt(i * 2, hidden)
    arms.setMatrixAt(i * 2 + 1, hidden)
  }

  return {
    obstacles: () => solidAt,
    shove(x, z, dirX, dirZ, strength) {
      const len = Math.hypot(dirX, dirZ)
      if (len < 1e-6 || !Number.isFinite(strength)) return // no direction, nothing to do
      const ux = dirX / len
      const uz = dirZ / len
      for (const w of walkers) {
        // Their current pavement position — the same base the walk loop draws,
        // plus any knockback still in hand so a second shove stacks onto the first.
        const A = graph.nodes[w.at]
        const B = graph.nodes[w.to]
        const l = Math.hypot(B.x - A.x, B.z - A.z) || 1
        const f = Math.min(1, w.s / l)
        const angle = Math.atan2(B.z - A.z, B.x - A.x)
        const wx = A.x + (B.x - A.x) * f + Math.sin(angle) * KERB * w.side + w.kx
        const wz = A.z + (B.z - A.z) * f - Math.cos(angle) * KERB * w.side + w.kz
        const dx = wx - x
        const dz = wz - z
        if (dx * dx + dz * dz > SHOVE_REACH * SHOVE_REACH) continue
        w.kx += ux * strength
        w.kz += uz * strength
        // Cap the offset so a hard clip still only shoves them clear of the car.
        const k = Math.hypot(w.kx, w.kz)
        if (k > MAX_KNOCK) {
          w.kx *= MAX_KNOCK / k
          w.kz *= MAX_KNOCK / k
        }
      }
    },
    setEnabled(on) {
      group.visible = on
      if (!on) solidAt.length = 0
    },
    dispose() {
      scene.remove(group)
      group.traverse((o) => {
        const mesh = o as THREE.Mesh
        mesh.geometry?.dispose()
        const mat = mesh.material
        if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((x) => x.dispose())
      })
      walkers.length = 0
      solidAt.length = 0
    },
    update(dt, camX, camZ) {
      clock += dt
      solidAt.length = 0
      walkers.forEach((w, i) => {
        w.s += w.speed * dt
        // Walk by arc length, carrying the overshoot on — see the note in
        // traffic.ts: a fixed arrival radius fires instantly on the short edges
        // a dense city is made of, and they jitter instead of walking.
        for (let hop = 0; hop < MAX_HOPS; hop++) {
          const a0 = graph.nodes[w.at]
          const b0 = graph.nodes[w.to]
          const l = Math.hypot(b0.x - a0.x, b0.z - a0.z)
          if (l <= 0.001) {
            w.at = w.to
            w.to = nextNode(graph, w.at, w.to, rng)
            w.s = 0
            continue
          }
          if (w.s < l) break
          w.s -= l
          const next = nextNode(graph, w.at, w.to, rng)
          w.at = w.to
          w.to = next
        }
        const A = graph.nodes[w.at]
        const B = graph.nodes[w.to]
        const len = Math.hypot(B.x - A.x, B.z - A.z) || 1
        const f = Math.min(1, w.s / len)
        const angle = Math.atan2(B.z - A.z, B.x - A.x)
        const baseX = A.x + (B.x - A.x) * f
        const baseZ = A.z + (B.z - A.z) * f
        let x = baseX + Math.sin(angle) * KERB * w.side
        let z = baseZ - Math.cos(angle) * KERB * w.side
        // The pavement offset can push a lakeside walker off the road onto the
        // water, where they'd stand on the bed under the surface. Keep them on
        // land: if this side is wet, cross to the other pavement and stay there;
        // if BOTH sides are water — a causeway or bridge deck — hide them.
        if (overWater(x, z)) {
          const fx = baseX - Math.sin(angle) * KERB * w.side
          const fz = baseZ + Math.cos(angle) * KERB * w.side
          if (overWater(fx, fz)) {
            hide(i)
            return
          }
          w.side = -w.side
          x = fx
          z = fz
        }

        if (Math.hypot(x - camX, z - camZ) > FAR) {
          const fresh = spawn({ x: camX, z: camZ })
          if (fresh) walkers[i] = fresh
        }

        // Ease any ramming knockback back toward zero — framerate-independent —
        // and draw them offset by what's left, so someone clipped staggers aside
        // and then walks on from there rather than snapping back onto the pavement.
        w.kx *= Math.exp(-KNOCK_DECAY * dt)
        w.kz *= Math.exp(-KNOCK_DECAY * dt)
        x += w.kx
        z += w.kz

        solidAt.push({ x, z, r: 0.4 })
        // A gentle bob, out of step with the next person, so a crowd doesn't march.
        const stride = clock * w.speed * 4 + w.phase
        const bob = Math.sin(stride * 2) * 0.025
        pos.set(x, provider.heightAt(x, z) + bob, z)
        q.setFromAxisAngle(up, -angle)
        m.compose(pos, q, one)
        bodies.setMatrixAt(i, m)
        heads.setMatrixAt(i, m)
        // Skirt and hair are rigid with the torso, not the legs, so they reuse
        // `m` unchanged — the same matrix as the body and head — rather than
        // the per-limb swing offset below.
        skirts.setMatrixAt(i, isGirl[i] ? m : hidden)
        hair.setMatrixAt(i, isGirl[i] ? m : hidden)

        // Legs and arms swing opposite each other, the way people walk.
        const swing = Math.sin(stride) * 0.5
        for (let k = 0; k < 2; k++) {
          const sign = k === 0 ? 1 : -1
          limbQ.setFromAxisAngle(right, swing * sign)
          off.compose(hip.set(0, 0.72, sign * 0.11), limbQ, one)
          mLimb.multiplyMatrices(m, off)
          legs.setMatrixAt(i * 2 + k, mLimb)

          limbQ.setFromAxisAngle(right, -swing * sign * 0.7)
          off.compose(hip.set(0, 1.42, sign * 0.26), limbQ, one)
          mLimb.multiplyMatrices(m, off)
          arms.setMatrixAt(i * 2 + k, mLimb)
        }
      })
      bodies.instanceMatrix.needsUpdate = true
      heads.instanceMatrix.needsUpdate = true
      legs.instanceMatrix.needsUpdate = true
      arms.instanceMatrix.needsUpdate = true
      skirts.instanceMatrix.needsUpdate = true
      hair.instanceMatrix.needsUpdate = true
    },
  }
}
