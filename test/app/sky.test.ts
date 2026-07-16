import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createSky } from '../../src/app/sky'

/** The shader itself can't run here; this covers the uniform wiring around it. */
describe('sky', () => {
  const build = () => {
    const scene = new THREE.Scene()
    const sky = createSky(scene)
    const mat = sky.mesh.material as THREE.ShaderMaterial
    return { sky, mat }
  }

  it('drives the star fade from the night factor', () => {
    const { sky, mat } = build()
    const dir = new THREE.Vector3(0, 1, 0)

    sky.update(new THREE.Vector3(), 0x9fc4e8, 0xfff2d0, dir, 1, 0)
    expect(mat.uniforms.uNight.value).toBe(0) // noon: no stars

    sky.update(new THREE.Vector3(), 0x0a0f1a, 0x223344, dir, 0, 1)
    expect(mat.uniforms.uNight.value).toBe(1) // midnight: full field
  })

  it('follows the camera so the dome is never escaped', () => {
    const { sky } = build()
    sky.update(new THREE.Vector3(120, 4, -80), 0x9fc4e8, 0xfff2d0, new THREE.Vector3(0, 1, 0), 1, 0)
    expect(sky.mesh.position.toArray()).toEqual([120, 4, -80])
  })

  it('declares the star uniform up front so the shader compiles', () => {
    const { mat } = build()
    expect(mat.uniforms.uNight).toBeDefined()
    expect(mat.fragmentShader).toContain('uniform float uNight')
  })
})
