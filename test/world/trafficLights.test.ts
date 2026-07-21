import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createTrafficLights, signalPhase } from '../../src/world/trafficLights'
import type { Road, RoadKind, Vec2 } from '../../src/geo/types'

const flat = { heightAt: () => 0 }
const v = (x: number, z: number): Vec2 => ({ x, z })

/** Deterministic PRNG (mulberry32) so the placement is stable across runs. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const road = (points: Vec2[], kind: RoadKind = 'primary'): Road => ({ points, kind })

/** The signal-head groups standing on the scene. */
const lightsOf = (scene: THREE.Scene): THREE.Object3D[] =>
  (scene.children[0] as THREE.Group).children.filter((c) => c.userData.trafficLight)

/** The colour of the one lit lens on a light, or null if none is lit. */
const activeOf = (light: THREE.Object3D): string | null => {
  let colour: string | null = null
  light.traverse((o) => {
    if (o.userData.trafficLamp) {
      const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial
      if (mat.emissiveIntensity > 0.01) colour = o.userData.signal as string
    }
  })
  return colour
}

/** A plus: two primaries crossing at the origin — one 4-way junction. */
const cross: Road[] = [
  road([v(-100, 0), v(0, 0), v(100, 0)]),
  road([v(0, -100), v(0, 0), v(0, 100)]),
]

/**
 * A grid of `n`×`n` crossings, `SPACING` apart — well clear of the merge radius.
 * Each line carries a vertex at every crossing (crossing OSM ways share a vertex,
 * which is how the weld reunites them) plus ends stretching 20m past the grid, so
 * every crossing is a full 4-way node.
 */
const SPACING = 60
function grid(n: number): Road[] {
  const roads: Road[] = []
  const lo = -20
  const hi = (n - 1) * SPACING + 20
  const at = Array.from({ length: n }, (_, k) => k * SPACING)
  for (let i = 0; i < n; i++) {
    roads.push(road([v(lo, i * SPACING), ...at.map((x) => v(x, i * SPACING)), v(hi, i * SPACING)]))
    roads.push(road([v(i * SPACING, lo), ...at.map((z) => v(i * SPACING, z)), v(i * SPACING, hi)]))
  }
  return roads
}

describe('traffic lights', () => {
  it('stands a signal at a 3+-way junction', () => {
    const scene = new THREE.Scene()
    createTrafficLights(scene, cross, flat, () => 0.5)
    const lights = lightsOf(scene)
    expect(lights.length, 'no signal at the crossroads').toBe(1)
    // Anchored on the junction it guards (the pole itself stands off in a corner).
    expect(lights[0].position.x).toBeCloseTo(0, 5)
    expect(lights[0].position.z).toBeCloseTo(0, 5)
  })

  it('leaves mid-road vertices and dead ends alone', () => {
    // A lone straight road: its ends are dead ends (degree 1), its middle a
    // pass-through (degree 2). Nothing is a junction, so nothing is signalled.
    const scene = new THREE.Scene()
    createTrafficLights(scene, [road([v(-100, 0), v(0, 0), v(100, 0)])], flat, () => 0.5)
    expect(lightsOf(scene).length).toBe(0)
  })

  it('respects the cap, busiest junctions first', () => {
    const scene = new THREE.Scene()
    // Nine crossings on a 3×3 grid; cap at three.
    createTrafficLights(scene, grid(3), flat, () => 0.5, 3)
    expect(lightsOf(scene).length).toBe(3)
  })

  it('advances the cycle — the lit lamp changes over successive updates', () => {
    const scene = new THREE.Scene()
    const t = createTrafficLights(scene, cross, flat, () => 0.5)
    const light = lightsOf(scene)[0]
    // Exactly one lens is ever lit.
    let lit = 0
    light.traverse((o) => {
      if (o.userData.trafficLamp) {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial
        if (m.emissiveIntensity > 0.01) lit++
      }
    })
    expect(lit, 'more than one lamp is lit at once').toBe(1)
    // Step through a whole cycle and collect every state the light passes through.
    const seen = new Set<string>()
    for (let i = 0; i < 300; i++) {
      const a = activeOf(light)
      if (a) seen.add(a)
      t.update(0.1)
    }
    expect(seen.has('green'), 'never showed green').toBe(true)
    expect(seen.has('amber'), 'never showed amber').toBe(true)
    expect(seen.has('red'), 'never showed red').toBe(true)
  })

  it('staggers the phase, so a run of lights never switches as one', () => {
    const scene = new THREE.Scene()
    createTrafficLights(scene, grid(3), flat, () => 0.5, 14)
    const lights = lightsOf(scene)
    expect(lights.length, 'need several lights to compare phases').toBeGreaterThan(2)
    const states = new Set(lights.map((l) => activeOf(l)))
    expect(states.size, 'every light is in lock-step').toBeGreaterThan(1)
  })

  it('is deterministic given the same rand', () => {
    const layout = (): string => {
      const scene = new THREE.Scene()
      createTrafficLights(scene, grid(3), flat, makeRng(0x516a1), 14)
      return lightsOf(scene)
        .map((l) => {
          // The pole's corner offset comes from rand — compare the casing too.
          const casing = l.children.find((c) => !c.userData.trafficLamp)!
          return `${l.position.x.toFixed(2)},${l.position.z.toFixed(2)}:${casing.position.x.toFixed(2)},${casing.position.z.toFixed(2)}`
        })
        .join('|')
    }
    expect(layout()).toBe(layout())
  })

  it('clears the scene when the city changes', () => {
    const scene = new THREE.Scene()
    const t = createTrafficLights(scene, cross, flat, () => 0.5)
    expect(scene.children.length).toBe(1)
    t.dispose()
    expect(scene.children.length, 'the old city\'s lights piled up').toBe(0)
  })

  it('no-ops with no roads', () => {
    const scene = new THREE.Scene()
    const t = createTrafficLights(scene, [], flat, () => 0.5)
    expect(lightsOf(scene).length).toBe(0)
    expect(() => t.update(0.1)).not.toThrow()
    expect(() => t.dispose()).not.toThrow()
  })

  it('exposes each junction and a live stop/go that tracks the lit lamp', () => {
    const scene = new THREE.Scene()
    const t = createTrafficLights(scene, cross, flat, () => 0.5)
    expect(t.junctions.length).toBe(1)
    expect(t.junctions[0].x).toBeCloseTo(0, 5)
    expect(t.junctions[0].z).toBeCloseTo(0, 5)
    // What a car obeys (isStop) must be exactly what the player sees lit, every
    // step of a full cycle: stop iff the lit lamp is NOT green.
    const light = lightsOf(scene)[0]
    for (let i = 0; i < 200; i++) {
      const lit = activeOf(light) // 'green' | 'amber' | 'red' | null
      expect(t.isStop(0), `isStop disagreed with the ${lit} lamp`).toBe(lit !== 'green')
      t.update(0.1)
    }
  })

  it('is safe to query a junction index that has no light', () => {
    const scene = new THREE.Scene()
    const t = createTrafficLights(scene, cross, flat, () => 0.5)
    expect(t.isStop(5)).toBe(false)
    expect(t.isStop(-1)).toBe(false)
  })
})

describe('signalPhase — the pure go/stop lookup a car obeys', () => {
  it('starts on go, matching the green that is lit from the first frame', () => {
    expect(signalPhase(0, 0)).toBe('go')
  })

  it('passes through both go and stop as the clock runs', () => {
    const seen = new Set<'go' | 'stop'>()
    for (let t = 0; t < 40; t += 0.1) seen.add(signalPhase(t, 0))
    expect(seen.has('go')).toBe(true)
    expect(seen.has('stop')).toBe(true)
  })

  it('never holds stop forever — red always yields to green within one cycle (no deadlock)', () => {
    // The backbone of the no-gridlock guarantee: the phase depends on the clock
    // alone, so the longest unbroken run of 'stop' is just the amber+red window and
    // is BOUNDED. Were it ever unbounded, a junction could hold traffic for good.
    const dt = 0.05
    let run = 0
    let maxStop = 0
    let greens = 0
    for (let t = 0; t < 300; t += dt) {
      if (signalPhase(t, 0) === 'stop') {
        run += dt
        maxStop = Math.max(maxStop, run)
      } else {
        run = 0
        greens++
      }
    }
    expect(greens, 'never showed green in 300s').toBeGreaterThan(0)
    expect(maxStop, 'red never ends — a car could be held for good').toBeLessThan(9)
  })

  it('shifts with the offset, so a run of lights need not switch in lock-step', () => {
    // At the same instant, some offset must read stop while offset 0 reads go.
    let differs = false
    for (let o = 0; o < 40; o += 0.1) if (signalPhase(0, o) === 'stop') differs = true
    expect(differs).toBe(true)
  })
})
