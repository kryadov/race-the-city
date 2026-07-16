import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { groundQuat } from '../../src/terrain/slope'

const flat = { heightAt: () => 0 }
/** Ground climbing 1 in 4 toward +x. */
const hill = { heightAt: (x: number) => x * 0.25 }

/** Which way is up for something oriented by `q`. */
const upOf = (q: THREE.Quaternion): THREE.Vector3 =>
  new THREE.Vector3(0, 1, 0).applyQuaternion(q)
/** Which way its nose points — the model's local +x. */
const noseOf = (q: THREE.Quaternion): THREE.Vector3 =>
  new THREE.Vector3(1, 0, 0).applyQuaternion(q)

describe('groundQuat', () => {
  const q = new THREE.Quaternion()

  it('stands level ground level', () => {
    const up = upOf(groundQuat(q, 0, 0, 0, flat))
    expect(up.y).toBeCloseTo(1, 6)
  })

  it('points the nose where it is heading', () => {
    // heading 0 faces +x; the yaw convention is the whole game's.
    const nose = noseOf(groundQuat(q, 0, 0, 0, flat))
    expect(nose.x).toBeCloseTo(1, 6)
    const east = noseOf(groundQuat(q, 0, 0, Math.PI / 2, flat))
    expect(east.z).toBeCloseTo(1, 6)
  })

  it('pitches into a climb rather than riding it flat', () => {
    // The traffic held a pure yaw and slid down hills dead level, like a lift.
    const nose = noseOf(groundQuat(q, 0, 0, 0, hill))
    expect(nose.y, 'the nose should be tipped up the hill').toBeGreaterThan(0.2)
  })

  it('tips its up-vector away from vertical on a slope', () => {
    expect(upOf(groundQuat(q, 0, 0, 0, hill)).y).toBeLessThan(0.99)
  })

  it('banks on a side-slope: across the hill, the nose stays level', () => {
    const nose = noseOf(groundQuat(q, 0, 0, Math.PI / 2, hill)) // driving along +z
    expect(nose.y).toBeCloseTo(0, 6)
    expect(upOf(groundQuat(q, 0, 0, Math.PI / 2, hill)).x).toBeLessThan(0) // leaning into it
  })

  it('holds a hovercraft level over any slope', () => {
    expect(upOf(groundQuat(q, 0, 0, 0, hill, true)).y).toBeCloseTo(1, 6)
  })

  it('stays a rotation — no scale or skew creeps in from the basis', () => {
    expect(groundQuat(q, 0, 0, 1.1, hill).length()).toBeCloseTo(1, 6)
  })
})
