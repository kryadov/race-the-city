import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createTrains } from '../../src/app/trains'
import { createAircraft } from '../../src/app/aircraft'
import type { Railway, Vec2 } from '../../src/geo/types'

const flat = { heightAt: () => 0 }
const v = (x: number, z: number): Vec2 => ({ x, z })
/** A 1km straight line — long enough to be worth a train. */
const mainLine: Railway = { points: [v(0, 0), v(500, 0), v(1000, 0)], tram: false, tunnel: false }
const siding: Railway = { points: [v(0, 50), v(40, 50)], tram: false, tunnel: false } // 40m: not worth one
const tramLine: Railway = { points: [v(0, 90), v(600, 90)], tram: true, tunnel: false }

const countCars = (scene: THREE.Scene): number =>
  (scene.children[0] as THREE.Group).children.length

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

  it('takes itself off the scene when the city changes', () => {
    const scene = new THREE.Scene()
    const t = createTrains(scene, [mainLine], flat, () => 0.5)
    expect(scene.children.length).toBe(1)
    t.dispose()
    expect(scene.children.length, 'trains from the old city must not pile up').toBe(0)
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
    // 0.8 picks the last of the four kinds, the helicopter. With Math.random this
    // test asserted luck: the rotors only turn while the helicopter is the one
    // flying, and in ~10% of runs it never came up at all.
    const scene = new THREE.Scene()
    const p = createAircraft(scene, () => 0.8)
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
