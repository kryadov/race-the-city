import * as THREE from 'three'

export interface Sky {
  mesh: THREE.Mesh
  /** Update the sky for the current time of day. */
  update(camPos: THREE.Vector3, horizon: number, sunColor: number, sunDir: THREE.Vector3, sunVis: number): void
  setVisible(on: boolean): void
}

/**
 * A sky dome: one big back-faced sphere carrying a vertical gradient plus a
 * glowing sun disc, both driven by day/night uniforms. One extra draw call and
 * a cheap fragment shader — the zenith is derived from the horizon colour so it
 * stays believable at every hour without extra keyframes.
 */
export function createSky(scene: THREE.Scene): Sky {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uHorizon: { value: new THREE.Color(0x9fc4e8) },
      uSun: { value: new THREE.Color(0xfff2d0) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunVis: { value: 1 },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uHorizon;
      uniform vec3 uSun;
      uniform vec3 uSunDir;
      uniform float uSunVis;
      varying vec3 vDir;
      void main() {
        vec3 dir = normalize(vDir);
        float h = clamp(dir.y, 0.0, 1.0);
        vec3 zenith = uHorizon * 0.55 + vec3(0.0, 0.02, 0.08);
        vec3 sky = mix(uHorizon, zenith, pow(h, 0.6));
        float d = max(dot(dir, normalize(uSunDir)), 0.0);
        float disc = smoothstep(0.9986, 0.9994, d);   // the crisp disc
        float glow = pow(d, 220.0) + pow(d, 8.0) * 0.12; // tight + broad halo
        sky += uSun * (disc + glow) * uSunVis;
        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1500, 24, 12), mat)
  mesh.frustumCulled = false
  mesh.renderOrder = -1 // paint the sky first, everything else over it
  scene.add(mesh)

  return {
    mesh,
    update(camPos, horizon, sunColor, sunDir, sunVis) {
      mesh.position.copy(camPos)
      ;(mat.uniforms.uHorizon.value as THREE.Color).setHex(horizon)
      ;(mat.uniforms.uSun.value as THREE.Color).setHex(sunColor)
      ;(mat.uniforms.uSunDir.value as THREE.Vector3).copy(sunDir).normalize()
      mat.uniforms.uSunVis.value = sunVis
    },
    setVisible(on) {
      mesh.visible = on
    },
  }
}
