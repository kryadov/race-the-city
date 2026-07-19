import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createTrains } from '../../src/app/trains'
import { createAircraft } from '../../src/app/aircraft'
import type { Railway, Road, Vec2 } from '../../src/geo/types'

const flat = { heightAt: () => 0 }
const v = (x: number, z: number): Vec2 => ({ x, z })
/** A 1km straight line — long enough to be worth a train. */
const mainLine: Railway = { points: [v(0, 0), v(500, 0), v(1000, 0)], tram: false, tunnel: false }
const siding: Railway = { points: [v(0, 50), v(40, 50)], tram: false, tunnel: false } // 40m: not worth one
const tramLine: Railway = { points: [v(0, 90), v(600, 90)], tram: true, tunnel: false }

/** The carriages, without the tunnel mouths standing at the ends of the line. */
const carsOf = (scene: THREE.Scene): THREE.Object3D[] =>
  (scene.children[0] as THREE.Group).children.filter((c) => !c.userData.portal)
const countCars = (scene: THREE.Scene): number => carsOf(scene).length

describe('trains', () => {
  it('runs no train down a tunnel — it would drive through the city above it', () => {
    // Monaco's railway is tunnelled end to end: all eleven ways of it.
    const scene = new THREE.Scene()
    createTrains(scene, [{ points: [v(0, 0), v(1000, 0)], tram: false, tunnel: true }], flat, () => 0.5)
    expect(countCars(scene)).toBe(0)
  })

  it('runs a train on a real line', () => {
    const scene = new THREE.Scene()
    createTrains(scene, [mainLine], flat, () => 0.5)
    expect(countCars(scene)).toBeGreaterThan(1) // several carriages
  })

  it('runs trams in a city that has mainline track as well', () => {
    // The bug: candidates were taken in list order until the count ran out, and
    // `parse.ts` emits every mainline line before the first tram. Prague has 260
    // railway ways and 52 tram ways, so the mainline filled every slot and not
    // one tram ever ran.
    const scene = new THREE.Scene()
    const mainlines: Railway[] = Array.from({ length: 20 }, (_, i) => ({
      points: [v(0, i * 10), v(1000, i * 10)],
      tram: false,
      tunnel: false,
    }))
    const trams: Railway[] = Array.from({ length: 5 }, (_, i) => ({
      points: [v(0, 500 + i * 10), v(600, 500 + i * 10)],
      tram: true,
      tunnel: false,
    }))
    createTrains(scene, [...mainlines, ...trams], flat, () => 0.5, 4)
    const group = scene.children[0] as THREE.Group
    // A tram is the one that carries a pantograph; nothing else does.
    const pantographs = group.children.filter((car) =>
      car.children.some((part) => part.type === 'Group'),
    )
    expect(pantographs.length).toBeGreaterThan(0)
  })

  it('runs them where you are, not wherever the OSM list happened to start', () => {
    // Five trains for four square kilometres: put them at the far corner and you
    // drive over rail after rail and never meet a thing on any of it. You start
    // at the middle.
    const scene = new THREE.Scene()
    // The far line comes first, as the one OSM listed first would.
    const far: Railway = { points: [v(1800, 1800), v(2800, 1800)], tram: false, tunnel: false }
    const near: Railway = { points: [v(-500, 20), v(500, 20)], tram: false, tunnel: false }
    const trains = createTrains(scene, [far, near], flat, () => 0.5, 1)
    trains.update(0.016, 0)
    const group = scene.children[0] as THREE.Group
    expect(group.children.length).toBeGreaterThan(0)
    // Every carriage should be on the near line, which runs along z = 20.
    for (const car of group.children) expect(car.position.z).toBeCloseTo(20, 0)
  })

  it('leaves a short siding alone', () => {
    // an intercity on a 40m stub would be absurd
    const scene = new THREE.Scene()
    createTrains(scene, [siding], flat, () => 0.5)
    expect(countCars(scene)).toBe(0)
  })

  it('moves along the track', () => {
    const scene = new THREE.Scene()
    const t = createTrains(scene, [mainLine], flat, () => 0.5)
    const car = (scene.children[0] as THREE.Group).children[0]
    t.update(0.016, 0)
    const start = car.position.clone()
    t.update(2, 0)
    expect(car.position.distanceTo(start)).toBeGreaterThan(1)
  })

  it('strings the carriages out behind each other, not on top', () => {
    const scene = new THREE.Scene()
    const t = createTrains(scene, [mainLine], flat, () => 0.5)
    t.update(0.016, 0)
    const cars = (scene.children[0] as THREE.Group).children
    expect(cars[0].position.distanceTo(cars[1].position)).toBeGreaterThan(5)
  })

  it('runs a tram on tram tracks, not a mainline train', () => {
    // tram tracks run down the street: an intercity on one drives a full-length
    // train straight through the traffic
    const scene = new THREE.Scene()
    createTrains(scene, [tramLine], flat, () => 0.5)
    expect(countCars(scene), 'a tram is a car or two, not a rake').toBeLessThanOrEqual(2)
    expect(countCars(scene)).toBeGreaterThan(0)
  })

  it('works a tram line too short for an intercity', () => {
    const scene = new THREE.Scene()
    createTrains(scene, [{ points: [v(0, 0), v(150, 0)], tram: true, tunnel: false }], flat, () => 0.5)
    expect(countCars(scene)).toBeGreaterThan(0)
  })

  it('never piles the carriages on the first point of the track', () => {
    // `at` clamps, so a carriage that has not reached the line yet used to sit
    // on its first metre — all of them at once, driving out of one another one
    // by one as the train started. That was the standing wagon.
    const scene = new THREE.Scene()
    const t = createTrains(scene, [mainLine], flat, () => 0)
    // s starts at 0 with rand() = 0: the whole rake is behind the line.
    t.update(0.016, 0)
    const shown = carsOf(scene).filter((c) => c.visible)
    const seen = new Set(shown.map((c) => `${Math.round(c.position.x)},${Math.round(c.position.z)}`))
    expect(seen.size, 'two carriages are standing in the same place').toBe(shown.length)
  })

  it('keeps a carriage out of sight until it has left the tunnel', () => {
    const scene = new THREE.Scene()
    const t = createTrains(scene, [mainLine], flat, () => 0)
    t.update(0.016, 0)
    const cars = carsOf(scene)
    expect(cars.some((c) => !c.visible), 'the rake should still be inside the tunnel').toBe(true)
    // Long enough for the whole train to be out on the line.
    t.update(20, 0)
    expect(carsOf(scene).every((c) => c.visible)).toBe(true)
  })

  it('is not solid while it is inside the tunnel', () => {
    const scene = new THREE.Scene()
    const t = createTrains(scene, [mainLine], flat, () => 0)
    t.update(0.016, 0)
    const hidden = carsOf(scene).filter((c) => !c.visible).length
    // One circle pair per visible carriage: nothing you cannot see is in the way.
    expect(t.obstacles().length).toBe((carsOf(scene).length - hidden) * 2)
  })

  it('stands a tunnel mouth at each end of the line', () => {
    const scene = new THREE.Scene()
    createTrains(scene, [mainLine], flat, () => 0.5)
    const mouths = (scene.children[0] as THREE.Group).children.filter((c) => c.userData.portal)
    expect(mouths.length).toBe(2)
    const at = mouths.map((m) => Math.round(m.position.x)).sort((a, b) => a - b)
    expect(at).toEqual([0, 1000]) // the two ends of the track, not somewhere in it
  })

  it('turns the train round rather than losing it out of the tunnel forever', () => {
    const scene = new THREE.Scene()
    const t = createTrains(scene, [mainLine], flat, () => 0)
    for (let i = 0; i < 400; i++) t.update(0.5, 0)
    expect(carsOf(scene).some((c) => c.visible), 'it never came back').toBe(true)
  })

  it('trails the tram pantograph behind the cab, not ahead of it', () => {
    // A single-arm pantograph leans AWAY from the direction of travel: the wire
    // must not catch under the knuckle. It was leaning into it.
    const scene = new THREE.Scene()
    createTrains(scene, [tramLine], flat, () => 0.5)
    const lead = carsOf(scene)[0]
    let bar: THREE.Object3D | null = null
    lead.traverse((o) => {
      if (o.userData.pantographBar) bar = o
    })
    expect(bar, 'the tram has no pantograph').not.toBeNull()
    // The model's nose is its local +x, so behind it is negative.
    expect(bar!.position.x, 'the contact bar is ahead of its own arm').toBeLessThan(0)
  })

  it('glazes the car with a row of separate windows, not one long strip', () => {
    // The old glazing was a single box the length of the car — a stripe, not
    // windows. It is now a merged row of panes down both sides; several per side.
    const scene = new THREE.Scene()
    createTrains(scene, [mainLine], flat, () => 0.5)
    const carriage = carsOf(scene)[1] // [0] is the locomotive, which has no band
    let glass: THREE.Mesh | null = null
    carriage.traverse((o) => {
      if (o.userData.trainGlass) glass = o as THREE.Mesh
    })
    expect(glass, 'the carriage has no glazing').not.toBeNull()
    // One merged mesh, both sides; a BoxGeometry contributes 24 positions.
    const boxes = glass!.geometry.getAttribute('position').count / 24
    expect(boxes, 'the glazing is still a single-box stripe').toBeGreaterThanOrEqual(6)
  })

  it('flows the car through a bend instead of snapping at the vertex', () => {
    // The heading used to be the bearing of the one segment the car's centre sat
    // on, so it jumped by the whole turn the instant the centre crossed a vertex:
    // a 90-degree corner flipped the body in a single frame. Orienting from the
    // two ends the car rests on spreads the turn over its length.
    const scene = new THREE.Scene()
    // kind -> intercity (windowed), s = 0 (line start), dir = 1 (run forward).
    const vals = [0.5, 0, 0]
    let i = 0
    const seq = (): number => vals[i++] ?? 0
    const corner: Railway = { points: [v(0, 0), v(150, 0), v(150, 150)], tram: false, tunnel: false }
    const t = createTrains(scene, [corner], flat, seq)
    const lead = (): THREE.Object3D => (scene.children[0] as THREE.Group).children[0]
    let maxTurn = 0
    let prev: THREE.Vector3 | null = null
    // Small steps forward, right through the corner; the train never reverses here.
    for (let f = 0; f < 320; f++) {
      t.update(0.02, 0)
      const car = lead()
      if (!car.visible) {
        prev = null
        continue
      }
      const fwd = new THREE.Vector3(1, 0, 0).applyEuler(car.rotation)
      fwd.y = 0
      if (fwd.lengthSq() < 1e-6) continue
      fwd.normalize()
      if (prev) maxTurn = Math.max(maxTurn, prev.angleTo(fwd))
      prev = fwd
    }
    expect(maxTurn, 'the car never rounded the bend').toBeGreaterThan(0)
    // Nowhere near the 90-degree (1.57 rad) jump the old snap made at the vertex.
    expect(maxTurn, 'the heading still snaps at the vertex').toBeLessThan(0.3)
  })

  it('takes itself off the scene when the city changes', () => {
    const scene = new THREE.Scene()
    const t = createTrains(scene, [mainLine], flat, () => 0.5)
    expect(scene.children.length).toBe(1)
    t.dispose()
    expect(scene.children.length, 'trains from the old city must not pile up').toBe(0)
  })
})

describe('level crossings', () => {
  // A ROAD cutting square across the main line at its start: the rail runs east
  // from (0, 0), this road runs north-south through x = 0, so they cross at
  // (0, 0) — where the rand=0 train also starts, so the boom is asked to drop on
  // frame one. A level crossing the code should find and put booms on.
  const acrossRoad: Road = { points: [v(0, -400), v(0, 400)], kind: 'residential' }

  // Every boom is a Group hung under a `barrier` mount; grab them all.
  const armsOf = (scene: THREE.Scene): THREE.Group[] => {
    const out: THREE.Group[] = []
    for (const c of (scene.children[0] as THREE.Group).children) {
      if (c.userData.barrier) {
        for (const a of c.children) if (a.type === 'Group') out.push(a as THREE.Group)
      }
    }
    return out
  }

  it('stands two booms at a crossing of two lines', () => {
    const scene = new THREE.Scene()
    createTrains(scene, [mainLine], flat, () => 0, 8, [acrossRoad])
    // One crossing, a boom on each side of the tracks.
    expect(armsOf(scene).length).toBe(2)
  })

  it('builds no barrier where nothing crosses the line', () => {
    // A lone line has no crossing on it, so no booms — and the old single-line
    // tests, which count everything on the scene, must stay undisturbed.
    const scene = new THREE.Scene()
    createTrains(scene, [mainLine], flat, () => 0)
    expect(armsOf(scene).length).toBe(0)
  })

  it('drops the boom as a train nears and raises it once the line is clear', () => {
    const scene = new THREE.Scene()
    // maxTrains = 1 puts the single train on the main line (nearest the middle),
    // running through the crossing at (0, 0); rand = 0 starts it there, dir east.
    // As it pulls away the crossing clears, and it returns each time it turns back.
    const t = createTrains(scene, [mainLine], flat, () => 0, 1, [acrossRoad])
    expect(armsOf(scene).length, 'no barrier was built at the crossing').toBe(2)
    let lo = Infinity
    let hi = -Infinity
    // 200s of half-frames: several passes of the crossing, near and clear both.
    for (let i = 0; i < 4000; i++) {
      t.update(0.05, 0)
      for (const a of armsOf(scene)) {
        lo = Math.min(lo, a.rotation.z)
        hi = Math.max(hi, a.rotation.z)
      }
    }
    // Lowered flat (~0) at least once while the train sat on the crossing...
    expect(lo, 'the boom never dropped for the approaching train').toBeLessThan(0.3)
    // ...and lifted back up (~vertical) once it had gone.
    expect(hi, 'the boom never lifted once the train had passed').toBeGreaterThan(1.2)
  })

  it('sweeps the boom rather than snapping it in one frame', () => {
    const scene = new THREE.Scene()
    const t = createTrains(scene, [mainLine], flat, () => 0, 1, [acrossRoad])
    const arm = armsOf(scene)[0]
    // A train sitting on the crossing wants the boom fully down; one small frame
    // must move it only part of the way, not slam it flat.
    const before = arm.rotation.z
    t.update(0.05, 0)
    const moved = before - arm.rotation.z
    expect(moved, 'the boom did not start to lower').toBeGreaterThan(0)
    expect(arm.rotation.z, 'the boom snapped straight to flat in a single frame').toBeGreaterThan(0.3)
  })
})

describe('aircraft', () => {
  it('stays out of the sky until its turn comes', () => {
    const scene = new THREE.Scene()
    const p = createAircraft(scene, () => 0.5)
    p.update(0.1, 0, 0, 0)
    const any = (scene.children[0] as THREE.Group).children.some((c) => c.visible)
    expect(any).toBe(false)
  })

  it('flies them over, and the sky is not permanently busy', () => {
    const scene = new THREE.Scene()
    const p = createAircraft(scene, () => 0.5)
    const group = scene.children[0] as THREE.Group
    const flying = (): boolean => group.children.some((c) => c.visible)

    let sawFlying = false
    let sawEmpty = false
    // real-ish frames: one 60s step would launch and land it in a single tick
    for (let i = 0; i < 4000; i++) {
      p.update(0.1, 0, 0, 0)
      if (flying()) sawFlying = true
      else sawEmpty = true
    }
    expect(sawFlying, 'nothing ever came over').toBe(true)
    expect(sawEmpty, 'they should be occasional, not a conveyor').toBe(true)
  })

  it('flies one kind at a time, not a formation', () => {
    const scene = new THREE.Scene()
    const p = createAircraft(scene, Math.random)
    const group = scene.children[0] as THREE.Group
    for (let i = 0; i < 3000; i++) {
      p.update(0.1, 0, 0, 0)
      expect(group.children.filter((c) => c.visible).length).toBeLessThanOrEqual(1)
    }
  })

  it('goes away when switched off', () => {
    const scene = new THREE.Scene()
    const p = createAircraft(scene, () => 0.5)
    for (let i = 0; i < 500; i++) p.update(0.1, 0, 0, 0)
    p.setEnabled(false)
    expect((scene.children[0] as THREE.Group).children.some((c) => c.visible)).toBe(false)
  })

  it('flies everything above the rooftops', () => {
    // They fly low on purpose — the chase camera looks down, so a true cruising
    // altitude is out of shot for good — but never through the town.
    const scene = new THREE.Scene()
    const p = createAircraft(scene, Math.random)
    for (let i = 0; i < 4000; i++) {
      p.update(0.1, 0, 0, 0)
      for (const f of (scene.children[0] as THREE.Group).children) {
        if (f.visible) expect(f.position.y).toBeGreaterThan(60)
      }
    }
  })

  it('flies more than one kind of thing', () => {
    // airliners, bizjets, turboprops and helicopters — different heights and shapes
    const scene = new THREE.Scene()
    createAircraft(scene, Math.random)
    expect((scene.children[0] as THREE.Group).children.length).toBeGreaterThan(3)
  })

  it('spins the helicopter rotors — still blades read as a crash', () => {
    // 0.7 lands on the helicopter, the fourth of five kinds. With Math.random this
    // test asserted luck: the rotors only turn while the helicopter is the one
    // flying, and in ~10% of runs it never came up at all.
    const scene = new THREE.Scene()
    const p = createAircraft(scene, () => 0.7)
    const heli = (scene.children[0] as THREE.Group).children.find((c) =>
      c.children.some((x) => x.userData.rotor === 'main'),
    )!
    const rotor = heli.children.find((x) => x.userData.rotor === 'main')!
    const before = rotor.rotation.y
    for (let i = 0; i < 900; i++) p.update(0.1, 0, 0, 0)
    expect(heli.visible, 'the helicopter should be the one up').toBe(true)
    expect(rotor.rotation.y).not.toBe(before)
  })
})

describe('trains on a grade', () => {
  /** A 600m line climbing 1-in-10. */
  const hillLine: Railway = { points: [v(0, 0), v(300, 0), v(600, 0)], tram: false, tunnel: false }
  const hill = { heightAt: (x: number) => x * 0.1 }

  it('sits the carriage on the track, not level with the map', () => {
    const scene = new THREE.Scene()
    const t = createTrains(scene, [hillLine], hill, () => 0.5)
    t.update(0.016, 0)
    for (const car of (scene.children[0] as THREE.Group).children) {
      // the track at that x is 0.1x high; the carriage must be there too
      expect(Math.abs(car.position.y - car.position.x * 0.1)).toBeLessThan(1.5)
    }
  })

  it('pitches the carriage to the grade rather than holding it level', () => {
    // Level on a 1-in-10 climb buries one end in the hill and hangs the other off it.
    const scene = new THREE.Scene()
    const t = createTrains(scene, [hillLine], hill, () => 0.5)
    t.update(0.016, 0)
    const car = (scene.children[0] as THREE.Group).children[0]
    const pitched = new THREE.Vector3(1, 0, 0).applyEuler(car.rotation)
    expect(Math.abs(pitched.y), 'the carriage is flat on a 1-in-10').toBeGreaterThan(0.05)
  })

  it('keeps it level on the flat', () => {
    const scene = new THREE.Scene()
    const t = createTrains(scene, [mainLine], flat, () => 0.5)
    t.update(0.016, 0)
    const car = (scene.children[0] as THREE.Group).children[0]
    const dir = new THREE.Vector3(1, 0, 0).applyEuler(car.rotation)
    expect(Math.abs(dir.y)).toBeLessThan(0.01)
  })
})

describe('balloons', () => {
  /** 0.95 lands on the last kind, the balloon. */
  const balloonRand = (): number => 0.95

  it('flies one, with a basket and people in it', () => {
    const scene = new THREE.Scene()
    createAircraft(scene, balloonRand)
    const frames = (scene.children[0] as THREE.Group).children
    // the balloon is the most-parted airframe: envelope, gores, basket, crew, rigging
    const parts = Math.max(...frames.map((f) => f.children.length))
    expect(parts).toBeGreaterThan(10)
  })

  it('drifts rather than flying a heading', () => {
    // an aeroplane points along its track; a balloon goes where the wind goes
    const scene = new THREE.Scene()
    const p = createAircraft(scene, balloonRand)
    for (let i = 0; i < 700; i++) p.update(0.1, 0, 0, 0)
    const up = (scene.children[0] as THREE.Group).children.find((f) => f.visible)
    expect(up, 'nothing came over').toBeDefined()
    const y1 = up!.position.y
    for (let i = 0; i < 60; i++) p.update(0.1, 0, 0, 0)
    expect(up!.position.y, 'it should ride up and down, not hold an altitude').not.toBeCloseTo(y1, 2)
  })

  it('keeps it low enough to see and high enough to clear the roofs', () => {
    const scene = new THREE.Scene()
    const p = createAircraft(scene, balloonRand)
    for (let i = 0; i < 700; i++) p.update(0.1, 0, 0, 0)
    const up = (scene.children[0] as THREE.Group).children.find((f) => f.visible)!
    expect(up.position.y).toBeGreaterThan(60)
    expect(up.position.y).toBeLessThan(140)
  })
})
