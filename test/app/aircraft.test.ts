import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createAircraft } from '../../src/app/aircraft'

/** Every userData.rotor tag found under an object, itself included. */
function rotorTags(o: THREE.Object3D): string[] {
  const tags: string[] = []
  o.traverse((c) => {
    const r = (c.userData as { rotor?: string }).rotor
    if (r) tags.push(r)
  })
  return tags
}

describe('aircraft', () => {
  it('builds a helicopter that still exposes a spinnable main and tail rotor', () => {
    const scene = new THREE.Scene()
    createAircraft(scene, () => 0.5)
    // The frames are built up front and parked on the group, one per kind.
    const group = scene.children[0] as THREE.Group
    // The helicopter is the frame carrying BOTH a 'main' and a 'tail' rotor —
    // the update loop spins those tagged groups, so losing either tag freezes
    // its blades, and a helicopter with still blades reads as a crash.
    const heli = group.children.find((f) => {
      const t = rotorTags(f)
      return t.includes('main') && t.includes('tail')
    })
    expect(heli, 'no frame carried both a main and a tail rotor').toBeDefined()
  })

  it('spins both helicopter rotors as time advances', () => {
    const scene = new THREE.Scene()
    // rand=0.7 lands on the helicopter (index 3 of five kinds); dt=60 clears the
    // arrival gap in one step so it's the selected, visible frame.
    const a = createAircraft(scene, () => 0.7)
    const group = scene.children[0] as THREE.Group
    a.update(60, 0, 0, 1)
    const heli = group.children.find((f) => f.visible)!

    let main: THREE.Object3D | undefined
    let tail: THREE.Object3D | undefined
    heli.traverse((c) => {
      const r = (c.userData as { rotor?: string }).rotor
      if (r === 'main') main = c
      else if (r === 'tail') tail = c
    })
    expect(main, 'the helicopter lost its main rotor').toBeDefined()
    expect(tail, 'the helicopter lost its tail rotor').toBeDefined()

    const m0 = main!.rotation.y
    const t0 = tail!.rotation.x
    a.update(0.1, 0, 0, 1)
    expect(main!.rotation.y, 'the main rotor did not spin').not.toBe(m0)
    expect(tail!.rotation.x, 'the tail rotor did not spin').not.toBe(t0)
  })
})
