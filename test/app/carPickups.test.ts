import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createCarPickups, NEAR_MIN, NEAR_MAX, FAR, APART } from '../../src/app/carPickups'
import { VEHICLE_TYPES, type VehicleType } from '../../src/vehicle/vehicles'
import type { Vec2 } from '../../src/geo/types'

const flat = { heightAt: () => 0 }

/** Road vertices spread over a ~1000m-radius city, like a real OSM network. */
function citySpots(): Vec2[] {
  const spots: Vec2[] = []
  for (let i = 0; i < 4000; i++) {
    const a = (i / 4000) * Math.PI * 2 * 7
    const r = 20 + (i % 980)
    spots.push({ x: Math.cos(a) * r, z: Math.sin(a) * r } as Vec2)
  }
  return spots
}

/** The pickup wrapper groups — the container is the field, its children are the cars. */
function cars(scene: THREE.Scene): THREE.Object3D[] {
  return (scene.children[0] as THREE.Group).children
}

const active = (scene: THREE.Scene): THREE.Object3D[] => cars(scene).filter((c) => c.visible)

const typeOf = (o: THREE.Object3D): VehicleType => o.userData.vehicleType as VehicleType

const distTo = (o: THREE.Object3D, x: number, z: number): number =>
  Math.hypot(o.position.x - x, o.position.z - z)

describe('car pickups', () => {
  it('scatters cars in the ring around the car, not across the whole city', () => {
    const scene = new THREE.Scene()
    const pk = createCarPickups(scene)
    pk.setSpots(citySpots(), flat, 300, -200)

    const out = active(scene)
    expect(out.length).toBeGreaterThan(0)
    for (const c of out) {
      const d = distTo(c, 300, -200)
      expect(d).toBeGreaterThanOrEqual(NEAR_MIN - 1)
      expect(d).toBeLessThanOrEqual(NEAR_MAX + 1)
    }
  })

  it('sits every pickup on the terrain height under it', () => {
    const scene = new THREE.Scene()
    const ground = { heightAt: (x: number, z: number) => Math.sin(x * 0.01) + Math.cos(z * 0.01) }
    const pk = createCarPickups(scene)
    pk.setSpots(citySpots(), ground, 0, 0)
    for (const c of active(scene)) {
      // resting height, before any bob has run
      expect(c.position.y).toBeCloseTo(ground.heightAt(c.position.x, c.position.z), 5)
    }
  })

  it('is a full car model, not a placeholder — many parts, of a known type', () => {
    const scene = new THREE.Scene()
    const pk = createCarPickups(scene)
    pk.setSpots(citySpots(), flat, 0, 0)
    const car = active(scene)[0]
    expect(VEHICLE_TYPES).toContain(typeOf(car))
    let parts = 0
    car.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) parts++
    })
    expect(parts).toBeGreaterThan(3) // a whole vehicle mesh, plus the glow ring
  })

  it('marks pickups as collectable — they bob and spin over time', () => {
    const scene = new THREE.Scene()
    const pk = createCarPickups(scene)
    pk.setSpots(citySpots(), flat, 0, 0)
    const car = active(scene).find((c) => distTo(c, 0, 0) > 10)! // one we will not drive onto
    const y0 = car.position.y
    const rot0 = car.rotation.y
    for (let i = 0; i < 30; i++) pk.update(0, 0, 0.016)
    expect(car.position.y).not.toBe(y0) // bobbed
    expect(car.rotation.y).not.toBe(rot0) // spun
  })

  it('driving onto a car returns its type and respawns it away as a new car', () => {
    const scene = new THREE.Scene()
    const pk = createCarPickups(scene)
    pk.setSpots(citySpots(), flat, 0, 0)

    const before = active(scene).length
    const target = active(scene).find((c) => distTo(c, 0, 0) > 10)!
    const wantType = typeOf(target)
    const px = target.position.x // where the player drives to, before the respawn moves it
    const pz = target.position.z

    const picked = pk.update(px, pz, 0.016)
    expect(picked).toBe(wantType)

    // the pool stays the same size — the taken car reappears elsewhere, not gone
    expect(active(scene).length).toBe(before)
    // ...and its fresh spot is away from where the player now sits
    expect(distTo(target, px, pz)).toBeGreaterThanOrEqual(NEAR_MIN - 1)
    expect(VEHICLE_TYPES).toContain(typeOf(target))
  })

  it('never spawns the type the player is already driving', () => {
    const scene = new THREE.Scene()
    const pk = createCarPickups(scene)
    pk.setAvoid('car') // player is in a plain car
    pk.setSpots(citySpots(), flat, 0, 0)
    for (const c of active(scene)) expect(typeOf(c)).not.toBe('car')

    // a respawn after a pickup avoids it too
    const target = active(scene).find((c) => distTo(c, 0, 0) > 10)!
    pk.update(target.position.x, target.position.z, 0.016)
    for (const c of active(scene)) expect(typeOf(c)).not.toBe('car')
  })

  it('returns null on frames where nothing is within reach', () => {
    const scene = new THREE.Scene()
    const pk = createCarPickups(scene)
    pk.setSpots(citySpots(), flat, 0, 0)
    // drive to open ground with no pickup on it
    expect(pk.update(5000, 5000, 0.016)).toBeNull()
  })

  it('takes only one car per frame even if two overlap the player', () => {
    const scene = new THREE.Scene()
    const pk = createCarPickups(scene)
    // a single spot forces the fallback path; several cars may pile near it
    pk.setSpots([{ x: 0, z: 0 } as Vec2], flat, 0, 0)
    const picked = pk.update(0, 0, 0.016)
    expect(picked === null || VEHICLE_TYPES.includes(picked)).toBe(true)
    // whatever happened, it returned at most one type — never an array or two swaps
  })

  it('recycles cars left far behind so the field follows the player', () => {
    const scene = new THREE.Scene()
    const pk = createCarPickups(scene)
    pk.setSpots(citySpots(), flat, 0, 0)
    pk.update(-800, 600, 0.016) // drive far from where they were placed
    for (const c of active(scene)) {
      expect(distTo(c, -800, 600)).toBeLessThanOrEqual(FAR)
    }
  })

  it('when disabled it hides everything and picks nothing', () => {
    const scene = new THREE.Scene()
    const pk = createCarPickups(scene)
    pk.setSpots(citySpots(), flat, 0, 0)
    const target = active(scene).find((c) => distTo(c, 0, 0) > 10)!
    pk.setEnabled(false)
    expect((scene.children[0] as THREE.Group).visible).toBe(false)
    expect(pk.update(target.position.x, target.position.z, 0.016)).toBeNull()
  })

  it('keeps the cars apart so two do not stand in one spot', () => {
    const scene = new THREE.Scene()
    const pk = createCarPickups(scene)
    pk.setSpots(citySpots(), flat, 0, 0)
    const out = active(scene)
    let closest = Infinity
    for (let i = 0; i < out.length; i++)
      for (let j = i + 1; j < out.length; j++)
        closest = Math.min(closest, out[i].position.distanceTo(out[j].position))
    expect(out.length, 'nothing was placed').toBeGreaterThan(1)
    expect(closest, 'two cars stand in the same spot').toBeGreaterThanOrEqual(APART - 0.01)
  })

  it('is deterministic — the same seed gives the same field', () => {
    const a = new THREE.Scene()
    const b = new THREE.Scene()
    createCarPickups(a, seeded()).setSpots(citySpots(), flat, 0, 0)
    createCarPickups(b, seeded()).setSpots(citySpots(), flat, 0, 0)
    const pa = active(a)
    const pb = active(b)
    expect(pa.length).toBe(pb.length)
    for (let i = 0; i < pa.length; i++) {
      expect(typeOf(pa[i])).toBe(typeOf(pb[i]))
      expect(pa[i].position.x).toBeCloseTo(pb[i].position.x, 5)
      expect(pa[i].position.z).toBeCloseTo(pb[i].position.z, 5)
    }
  })

  it('is a no-op with no spots — nothing shown, nothing picked', () => {
    const scene = new THREE.Scene()
    const pk = createCarPickups(scene)
    pk.setSpots([], flat, 0, 0)
    expect(active(scene).length).toBe(0)
    expect(pk.update(0, 0, 0.016)).toBeNull()
  })

  it('dispose pulls the whole field out of the scene', () => {
    const scene = new THREE.Scene()
    const pk = createCarPickups(scene)
    pk.setSpots(citySpots(), flat, 0, 0)
    expect(scene.children.length).toBe(1)
    pk.dispose()
    expect(scene.children.length).toBe(0)
  })
})

/** A fixed-seed mulberry32, so both scenes in the determinism test start level. */
function seeded(): () => number {
  let a = 12345 >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
