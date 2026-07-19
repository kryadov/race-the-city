import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createTraffic } from '../../src/app/traffic'
import { createPedestrians } from '../../src/app/pedestrians'
import type { Road, Vec2 } from '../../src/geo/types'

const v = (x: number, z: number): Vec2 => ({ x, z })
const flat = { heightAt: () => 0 }
const grid: Road[] = [
  { points: [v(-500, 0), v(0, 0), v(500, 0)], kind: 'residential' },
  { points: [v(0, -500), v(0, 0), v(0, 500)], kind: 'residential' },
]
const footpath: Road[] = [{ points: [v(-500, 20), v(500, 20)], kind: 'path' }]

/** Every instance's world position, read back out of the InstancedMesh. */
function positions(mesh: THREE.InstancedMesh): THREE.Vector3[] {
  const out: THREE.Vector3[] = []
  const m = new THREE.Matrix4()
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m)
    out.push(new THREE.Vector3().setFromMatrixPosition(m))
  }
  return out
}

describe('traffic', () => {
  it('puts cars on the road', () => {
    const scene = new THREE.Scene()
    const t = createTraffic(scene, grid, flat, () => 0.5)
    t.update(0.016, 0, 0, 0)
    const bodies = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh
    expect(bodies.count).toBeGreaterThan(1)
  })

  it('drives them along', () => {
    const scene = new THREE.Scene()
    const t = createTraffic(scene, grid, flat, () => 0.5)
    t.update(0.016, 0, 0, 0)
    const bodies = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh
    const before = positions(bodies)
    t.update(2, 0, 0, 0)
    const after = positions(bodies)
    const moved = before.some((p, i) => p.distanceTo(after[i]) > 0.5)
    expect(moved).toBe(true)
  })

  it('keeps them off the centreline, so oncoming cars pass rather than merge', () => {
    const scene = new THREE.Scene()
    const t = createTraffic(scene, grid, flat, () => 0.5)
    t.update(0.016, 0, 0, 0)
    const bodies = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh
    // every car on the east-west road must be offset in z, not sitting on z=0
    for (const p of positions(bodies)) {
      const onEastWest = Math.abs(p.z) < 4 && Math.abs(p.x) > 10
      if (onEastWest) expect(Math.abs(p.z)).toBeGreaterThan(1)
    }
  })

  it('survives a city with no roads at all', () => {
    const scene = new THREE.Scene()
    const t = createTraffic(scene, [], flat, () => 0.5)
    expect(() => t.update(0.016, 0, 0, 0)).not.toThrow()
  })

  it('clears off the scene when the city changes', () => {
    const scene = new THREE.Scene()
    const t = createTraffic(scene, grid, flat, () => 0.5)
    expect(scene.children.length).toBe(1)
    t.dispose()
    expect(scene.children.length).toBe(0)
  })
})

describe('pedestrians', () => {
  it('walks people on a footway, where cars are not allowed', () => {
    // the driving graph drops paths; this is the difference between the two
    const scene = new THREE.Scene()
    const p = createPedestrians(scene, footpath, flat, () => 0.5)
    p.update(0.016, 0, 20)
    const bodies = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh
    expect(bodies.count).toBeGreaterThan(1)
  })

  it('walks, rather than driving', () => {
    const scene = new THREE.Scene()
    const p = createPedestrians(scene, grid, flat, () => 0.5)
    p.update(0.016, 0, 0)
    const bodies = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh
    const before = positions(bodies)
    p.update(1, 0, 0)
    const after = positions(bodies)
    const step = before.map((b, i) => b.distanceTo(after[i])).filter((d) => d < 50)
    expect(Math.max(...step), 'walking pace, in one second').toBeLessThan(3)
  })

  it('keeps them on the pavement, off the carriageway', () => {
    const scene = new THREE.Scene()
    const p = createPedestrians(scene, grid, flat, () => 0.5)
    p.update(0.016, 0, 0)
    const bodies = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh
    for (const pos of positions(bodies)) {
      const onEastWest = Math.abs(pos.z) < 8 && Math.abs(pos.x) > 10
      if (onEastWest) expect(Math.abs(pos.z)).toBeGreaterThan(3)
    }
  })

  it('clears off the scene when the city changes', () => {
    const scene = new THREE.Scene()
    const p = createPedestrians(scene, grid, flat, () => 0.5)
    p.dispose()
    expect(scene.children.length).toBe(0)
  })
})

describe('girls in skirts', () => {
  /**
   * A walker who doesn't have a part (a boy with no skirt) isn't removed from
   * the InstancedMesh — that would mean a variable instance count, and a
   * variable draw-call footprint with it. Instead their slot is collapsed to a
   * zero-size point (see `hidden` in pedestrians.ts), so "does this instance
   * actually show" has to be read back from its scale, not its presence.
   */
  function visible(mesh: THREE.InstancedMesh, i: number): boolean {
    const m = new THREE.Matrix4()
    const scale = new THREE.Vector3()
    mesh.getMatrixAt(i, m)
    m.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale)
    return scale.length() > 0.01
  }

  it('puts both plain walkers and girls in skirts on the street', () => {
    const scene = new THREE.Scene()
    const p = createPedestrians(scene, grid, flat, () => 0.5, 40)
    p.update(0.016, 0, 0)
    const skirts = (scene.children[0] as THREE.Group).children[4] as THREE.InstancedMesh
    const girls = Array.from({ length: skirts.count }, (_, i) => visible(skirts, i)).filter(Boolean).length
    expect(girls, 'nobody was in a skirt').toBeGreaterThan(0)
    expect(girls, 'everybody was in a skirt').toBeLessThan(skirts.count)
    // roughly a third to a half, per the brief, with slack for a small sample
    expect(girls / skirts.count).toBeGreaterThan(0.2)
    expect(girls / skirts.count).toBeLessThan(0.65)
  })

  it('keeps the split fixed rather than reshuffling it from the passed-in randomness', () => {
    // Math.random would give a different split on every reload; the whole
    // point of a dedicated seed (see RNG_SEED in world/greenery.ts) is a city
    // that looks the same regardless of what `rand` the caller passes in.
    const sceneA = new THREE.Scene()
    createPedestrians(sceneA, grid, flat, Math.random, 30).update(0.016, 0, 0)
    const skirtsA = (sceneA.children[0] as THREE.Group).children[4] as THREE.InstancedMesh

    const sceneB = new THREE.Scene()
    createPedestrians(sceneB, grid, flat, () => 0.9, 30).update(0.016, 0, 0)
    const skirtsB = (sceneB.children[0] as THREE.Group).children[4] as THREE.InstancedMesh

    expect(skirtsA.count).toBe(skirtsB.count)
    for (let i = 0; i < skirtsA.count; i++) {
      expect(visible(skirtsA, i)).toBe(visible(skirtsB, i))
    }
  })

  it('does not add a draw call per walker: the same number of parts at any crowd size', () => {
    const small = new THREE.Scene()
    createPedestrians(small, grid, flat, () => 0.5, 3)
    const big = new THREE.Scene()
    createPedestrians(big, grid, flat, () => 0.5, 60)
    const partsSmall = (small.children[0] as THREE.Group).children.length
    const partsBig = (big.children[0] as THREE.Group).children.length
    expect(partsBig).toBe(partsSmall)
  })

  it('sizes the skirt to bracket the legs’ hip pivot, not float above or below it', () => {
    // the legs swing from local y=0.72 (see the hip offset in pedestrians.ts);
    // a skirt that doesn't span that height would leave a gap or float free
    const scene = new THREE.Scene()
    const p = createPedestrians(scene, grid, flat, () => 0.5, 10)
    p.update(0.016, 0, 0)
    const skirts = (scene.children[0] as THREE.Group).children[4] as THREE.InstancedMesh
    skirts.geometry.computeBoundingBox()
    const box = skirts.geometry.boundingBox!
    expect(box.min.y).toBeLessThan(0.72)
    expect(box.max.y).toBeGreaterThan(0.72)
    // and wide enough sideways to cover a leg offset ±0.11 from the centreline
    // plus its own half-width, so no thigh shows past the hem
    expect(box.max.x).toBeGreaterThan(0.19)
  })
})

describe('recycling out of sight', () => {
  /** The scene's fog: nothing is visible past this, so nothing may pop inside it. */
  const FOG_FULL = 900

  const bigGrid: Road[] = []
  for (let i = -6; i <= 6; i++) {
    bigGrid.push({ points: [v(-2000, i * 300), v(2000, i * 300)], kind: 'residential' })
    bigGrid.push({ points: [v(i * 300, -2000), v(i * 300, 2000)], kind: 'residential' })
  }

  it('never spawns a car where you could watch it arrive', () => {
    const scene = new THREE.Scene()
    const t = createTraffic(scene, bigGrid, flat, Math.random)
    const bodies = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh

    // drive a long way, forcing wholesale recycling, and watch for anything
    // materialising within sight of the camera
    let camX = 0
    for (let step = 0; step < 40; step++) {
      camX += 60
      const before = positions(bodies).map((p) => p.clone())
      t.update(0.5, camX, 0, 0)
      const after = positions(bodies)
      after.forEach((p, i) => {
        const jumped = p.distanceTo(before[i]) > 40 // recycled, not driven
        if (!jumped) return
        const d = Math.hypot(p.x - camX, p.z)
        expect(d, 'a car appeared inside the fog').toBeGreaterThan(FOG_FULL * 0.6)
      })
    }
  })

  it('keeps cars around long enough to disappear into the fog, not in plain view', () => {
    const scene = new THREE.Scene()
    const t = createTraffic(scene, bigGrid, flat, Math.random)
    const bodies = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh
    let camX = 0
    for (let step = 0; step < 30; step++) {
      camX += 60
      t.update(0.5, camX, 0, 0)
      const before = positions(bodies).map((p) => p.clone())
      t.update(0.5, camX, 0, 0)
      positions(bodies).forEach((p, i) => {
        if (p.distanceTo(before[i]) <= 40) return
        const wasAt = Math.hypot(before[i].x - camX, before[i].z)
        expect(wasAt, 'a car vanished in plain view').toBeGreaterThan(FOG_FULL * 0.6)
      })
    }
  })
})

describe('dense city, short edges', () => {
  /** A road mapped with vertices ~3m apart, as OSM does through a town. */
  const finelyMapped: Road[] = [
    { points: Array.from({ length: 400 }, (_, i) => v(i * 3, 0)), kind: 'residential' },
  ]

  it('drives smoothly where the vertices are metres apart', () => {
    // The bug: the car advanced when within ARRIVE(4m) of the next node, which
    // on a 3m edge is true on the first frame — so it hopped node to node every
    // frame instead of driving, and jittered.
    const scene = new THREE.Scene()
    const t = createTraffic(scene, finelyMapped, flat, () => 0.5)
    const bodies = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh

    t.update(1 / 60, 0, 0, 0)
    let prev = positions(bodies).map((p) => p.clone())
    for (let f = 0; f < 200; f++) {
      t.update(1 / 60, 0, 0, 0)
      const now = positions(bodies)
      now.forEach((p, i) => {
        const step = p.distanceTo(prev[i])
        // at ~13m/s a frame is ~0.22m; anything near a metre is a teleport
        expect(step, 'a car jumped instead of driving').toBeLessThan(1)
      })
      prev = now.map((p) => p.clone())
    }
  })

  it('walks people smoothly on the same roads', () => {
    const scene = new THREE.Scene()
    const p = createPedestrians(scene, finelyMapped, flat, () => 0.5)
    const bodies = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh
    p.update(1 / 60, 0, 0)
    let prev = positions(bodies).map((q) => q.clone())
    for (let f = 0; f < 200; f++) {
      p.update(1 / 60, 0, 0)
      const now = positions(bodies)
      now.forEach((q, i) => {
        expect(q.distanceTo(prev[i]), 'a pedestrian jumped').toBeLessThan(0.5)
      })
      prev = now.map((q) => q.clone())
    }
  })

  it('still gets somewhere, rather than standing still', () => {
    const scene = new THREE.Scene()
    const t = createTraffic(scene, finelyMapped, flat, () => 0.5)
    const bodies = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh
    t.update(1 / 60, 0, 0, 0)
    const start = positions(bodies).map((p) => p.clone())
    for (let f = 0; f < 600; f++) t.update(1 / 60, 0, 0, 0)
    const moved = positions(bodies).some((p, i) => p.distanceTo(start[i]) > 20)
    expect(moved).toBe(true)
  })

  it('survives a road with a repeated point', () => {
    // duplicate vertices give a zero-length edge; dividing by it hangs the walk
    const dupes: Road[] = [{ points: [v(0, 0), v(10, 0), v(10, 0), v(20, 0)], kind: 'residential' }]
    const scene = new THREE.Scene()
    const t = createTraffic(scene, dupes, flat, () => 0.5)
    expect(() => {
      for (let f = 0; f < 200; f++) t.update(1 / 60, 0, 0, 0)
    }).not.toThrow()
  })
})

describe('level crossings', () => {
  const line: Road[] = [{ points: [v(-400, 0), v(400, 0)], kind: 'residential' }]

  it('holds the traffic for a train across the road', () => {
    // the traffic has no physics, so if it doesn't check, nothing stops it
    const scene = new THREE.Scene()
    const t = createTraffic(scene, line, flat, () => 0.5)
    const bodies = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh

    // A train across the road on both sides of every car: they drive either way
    // down it, so one blocker each would sit behind half of them.
    t.update(1 / 60, 0, 0, 0)
    const train = positions(bodies).flatMap((p) => [
      { x: p.x + 6, z: p.z, r: 2.4 },
      { x: p.x - 6, z: p.z, r: 2.4 },
    ])

    const before = positions(bodies).map((p) => p.clone())
    for (let f = 0; f < 120; f++) t.update(1 / 60, 0, 0, 0, train)
    positions(bodies).forEach((p, i) => {
      expect(p.distanceTo(before[i]), 'a car drove through the train').toBeLessThan(2)
    })
  })

  it('drives on once the train has gone', () => {
    const scene = new THREE.Scene()
    const t = createTraffic(scene, line, flat, () => 0.5)
    const bodies = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh
    t.update(1 / 60, 0, 0, 0)
    const before = positions(bodies).map((p) => p.clone())
    for (let f = 0; f < 120; f++) t.update(1 / 60, 0, 0, 0, [])
    const moved = positions(bodies).some((p, i) => p.distanceTo(before[i]) > 2)
    expect(moved).toBe(true)
  })

  it('ignores a train that is beside the road, not on it', () => {
    const scene = new THREE.Scene()
    const t = createTraffic(scene, line, flat, () => 0.5)
    const bodies = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh
    t.update(1 / 60, 0, 0, 0)
    const aside = positions(bodies).flatMap((p) => [
      { x: p.x + 6, z: p.z + 30, r: 2.4 },
      { x: p.x - 6, z: p.z + 30, r: 2.4 },
    ])
    const before = positions(bodies).map((p) => p.clone())
    for (let f = 0; f < 120; f++) t.update(1 / 60, 0, 0, 0, aside)
    const moved = positions(bodies).some((p, i) => p.distanceTo(before[i]) > 2)
    expect(moved).toBe(true)
  })
})

describe('smooth cornering', () => {
  /** Each car's drawn heading (radians), read back out of the body matrix. */
  function headings(mesh: THREE.InstancedMesh): number[] {
    const out: number[] = []
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const fwd = new THREE.Vector3()
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m)
      m.decompose(new THREE.Vector3(), q, new THREE.Vector3())
      // On flat ground groundQuat is a pure yaw, so the nose (local +x) reads it.
      fwd.set(1, 0, 0).applyQuaternion(q)
      out.push(Math.atan2(fwd.z, fwd.x))
    }
    return out
  }

  /** Shortest signed angle from a to b, in (-pi, pi]. */
  const turn = (a: number, b: number): number => {
    let d = b - a
    d -= Math.round(d / (2 * Math.PI)) * (2 * Math.PI)
    return d
  }

  it('eases the heading through a junction rather than snapping 90 degrees', () => {
    // An L: the only way on past the corner is a right-angle turn, and each arm
    // is long enough (>120m) that roomToDrive is happy to put cars here. Before,
    // `place` set the yaw straight to the new edge and the car pivoted on the
    // spot at (0,0); now the drawn heading is eased toward it, so the nose swings
    // round over several frames while the car keeps moving — an arc, not a snap.
    const ell: Road[] = [{ points: [v(-130, 0), v(0, 0), v(0, 130)], kind: 'residential' }]
    const scene = new THREE.Scene()
    const t = createTraffic(scene, ell, flat, () => 0.5)
    const bodies = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh

    t.update(1 / 60, 0, 0, 0)
    let prev = headings(bodies)
    const total = new Array(bodies.count).fill(0)
    let maxStep = 0
    for (let f = 0; f < 2400; f++) {
      t.update(1 / 60, 0, 0, 0)
      const now = headings(bodies)
      for (let i = 0; i < now.length; i++) {
        const step = Math.abs(turn(prev[i], now[i]))
        maxStep = Math.max(maxStep, step)
        total[i] += step
      }
      prev = now
    }

    // A snap would turn a right-angle (or a dead-end U-turn) in a single frame;
    // eased at k=5 the largest step is well under a tenth of that.
    expect(maxStep, 'a car snapped its heading in one frame').toBeLessThan(0.5)
    // And it must actually have turned — cars on an L round the corner over and
    // over, so at least one should rack up more than a right-angle of turning.
    expect(Math.max(...total), 'no car ever turned').toBeGreaterThan(2)
  })
})

describe('traffic on a slope', () => {
  it('stands the cars on the hill rather than sliding them down it flat', () => {
    // A pure yaw held every car dead level and it rode the hill like a lift.
    const hill = { heightAt: (x: number) => x * 0.25 }
    const scene = new THREE.Scene()
    const t = createTraffic(scene, grid, hill, () => 0.5)
    t.update(0.016, 0, 0, 0)
    const bodies = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    let tilted = false
    for (let i = 0; i < bodies.count; i++) {
      bodies.getMatrixAt(i, m)
      m.decompose(new THREE.Vector3(), q, new THREE.Vector3())
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q)
      if (up.y < 0.999) tilted = true
    }
    expect(tilted, 'every car sat perfectly level on a 1-in-4 hill').toBe(true)
  })
})

describe('cars trapped on a stub', () => {
  it('puts no car on a stub it could only turn round on', () => {
    // A stub is a dead end at both ends: nextNode turns the car round every
    // couple of seconds, flipping it 180 degrees on the spot. That's the twitch.
    // It used to be caught after the fact — two U-turns and recycle it — which
    // still showed you the dance. Nothing is put there in the first place now,
    // and an empty street beats a car shuttling up and down a driveway.
    const stub: Road[] = [{ points: [v(0, 0), v(14, 0)], kind: 'residential' }]
    const scene = new THREE.Scene()
    const t = createTraffic(scene, stub, flat, () => 0.5)
    const bodies = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh

    expect(() => {
      for (let f = 0; f < 600; f++) t.update(1 / 60, 0, 0, 0)
    }).not.toThrow()
    expect(bodies.count, 'a car was parked on a 14m dead end').toBe(0)
  })

  it('takes a stubbed car to real road when there is some', () => {
    // a long through-road plus a tiny stub: the car should end up on the road
    // vertices every 50m, so there are nodes in the respawn ring (620..900m)
    const mixed: Road[] = [
      { points: Array.from({ length: 37 }, (_, i) => v(-900 + i * 50, 200)), kind: 'residential' },
      { points: [v(0, 0), v(12, 0)], kind: 'residential' },
    ]
    const scene = new THREE.Scene()
    const t = createTraffic(scene, mixed, flat, Math.random)
    const bodies = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh
    for (let f = 0; f < 1200; f++) t.update(1 / 60, 0, 0, 0)
    // nobody should still be pinned to the 12m stub
    const onStub = positions(bodies).filter((p) => Math.abs(p.z) < 100 && p.x > -20 && p.x < 32)
    expect(onStub.length).toBe(0)
  })

})

describe('car-to-car separation', () => {
  it('queues a faster car behind a slower one instead of driving through it', () => {
    // Two cars on one long straight road, both set off the same way: the RNG is
    // scripted so both spawn on node 0 and head +x, a slow one at 7m/s and a
    // fast one at ~13m/s behind it. Before, the fast car simply interpolated
    // through the slow one and out the far side; now it must catch up, then sit
    // on its tail holding a gap — never overlapping, and never breaking free.
    const straight: Road[] = [{ points: [v(-800, 0), v(800, 0)], kind: 'residential' }]
    // rand is only touched while building: per car, [node pick, speed, type];
    // node 0.1 -> node 0, speed 0 -> 7m/s for the first, 0.99 -> ~13m/s for the
    // second. Direction is drawn from the traffic's own internal RNG, not this.
    const seq = [0.1, 0, 0, 0.1, 0.99, 0]
    let k = 0
    const rand = (): number => (k < seq.length ? seq[k++] : 0)

    const scene = new THREE.Scene()
    const t = createTraffic(scene, straight, flat, rand, 2)
    const bodies = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh
    expect(bodies.count).toBe(2)

    // Let the fast car close the gap and settle into a steady follow.
    for (let f = 0; f < 400; f++) t.update(1 / 60, 0, 0, 0)

    const start = positions(bodies).map((p) => p.clone())
    let minGap = Infinity
    let maxGap = 0
    for (let f = 0; f < 1500; f++) {
      t.update(1 / 60, 0, 0, 0)
      const [a, b] = positions(bodies)
      const gap = a.distanceTo(b)
      minGap = Math.min(minGap, gap)
      maxGap = Math.max(maxGap, gap)
    }
    const end = positions(bodies)

    // Never passed through: a car is ~4m long, so centres closer than that mean
    // they have merged. They queue with clear air between them instead.
    expect(minGap, 'the cars overlapped').toBeGreaterThan(4)
    // Never broke free: were following not working, the fast car would sail on
    // and the gap would grow without bound down 1600m of open road.
    expect(maxGap, 'the fast car drove off rather than following').toBeLessThan(14)
    // Both still made real progress — a jam that freezes is as wrong as one
    // that overlaps.
    expect(end[0].x - start[0].x, 'the lead car stalled').toBeGreaterThan(100)
    expect(end[1].x - start[1].x, 'the following car stalled').toBeGreaterThan(100)
  })
})
