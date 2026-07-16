import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createTrains } from '../../src/app/trains'
import { createPlanes } from '../../src/app/planes'
import type { Vec2 } from '../../src/geo/types'

const flat = { heightAt: () => 0 }
const v = (x: number, z: number): Vec2 => ({ x, z })
/** A 1km straight line — long enough to be worth a train. */
const mainLine: Vec2[] = [v(0, 0), v(500, 0), v(1000, 0)]
const siding: Vec2[] = [v(0, 50), v(40, 50)] // 40m: not worth one

const countCars = (scene: THREE.Scene): number =>
  (scene.children[0] as THREE.Group).children.length

describe('trains', () => {
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

  it('takes itself off the scene when the city changes', () => {
    const scene = new THREE.Scene()
    const t = createTrains(scene, [mainLine], flat, () => 0.5)
    expect(scene.children.length).toBe(1)
    t.dispose()
    expect(scene.children.length, 'trains from the old city must not pile up').toBe(0)
  })
})

describe('planes', () => {
  it('stays out of the sky until its turn comes', () => {
    const scene = new THREE.Scene()
    const p = createPlanes(scene, () => 0.5)
    p.update(0.1, 0, 0, 0)
    expect((scene.children[0] as THREE.Group).visible).toBe(false)
  })

  it('flies one over eventually, then clears off', () => {
    const scene = new THREE.Scene()
    const p = createPlanes(scene, () => 0.5)
    const group = scene.children[0] as THREE.Group
    // step in real-ish frames: one 60s step would both launch and land it
    const run = (secs: number): void => {
      for (let i = 0; i < secs * 10; i++) p.update(0.1, 0, 0, 0)
    }
    run(50) // waits ~47s before the first one
    expect(group.visible, 'a plane should have come over by now').toBe(true)
    run(45) // SPAN/SPEED is ~31s, so it has crossed and gone
    expect(group.visible).toBe(false)
  })

  it('goes away when switched off', () => {
    const scene = new THREE.Scene()
    const p = createPlanes(scene, () => 0.5)
    for (let i = 0; i < 500; i++) p.update(0.1, 0, 0, 0)
    p.setEnabled(false)
    expect((scene.children[0] as THREE.Group).visible).toBe(false)
  })

  it('flies at a believable height, not through the rooftops', () => {
    const scene = new THREE.Scene()
    const p = createPlanes(scene, () => 0.5)
    for (let i = 0; i < 500; i++) p.update(0.1, 0, 0, 0)
    const plane = (scene.children[0] as THREE.Group).children[0]
    expect(plane.position.y).toBeGreaterThan(100)
  })
})
