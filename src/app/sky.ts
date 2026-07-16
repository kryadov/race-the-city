import * as THREE from 'three'

export interface Sky {
  mesh: THREE.Mesh
  /** Update the sky for the current time of day. `night` is 0 by day, 1 after dusk. */
  update(
    camPos: THREE.Vector3,
    horizon: number,
    sunColor: number,
    sunDir: THREE.Vector3,
    sunVis: number,
    night: number,
  ): void
  setVisible(on: boolean): void
}

/**
 * A sky dome: one big back-faced sphere carrying a vertical gradient, a glowing
 * sun disc and procedural stars, all driven by day/night uniforms. One extra
 * draw call and a cheap fragment shader — the zenith is derived from the horizon
 * colour so it stays believable at every hour without extra keyframes, and the
 * stars are hashed from the view direction rather than being real objects.
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
      uNight: { value: 0 },
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
      uniform float uNight;
      varying vec3 vDir;

      float hash13(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
      }

      // Stars, hashed straight from the view direction: chop the sky into cells,
      // keep a star in the sparse few, and jitter it inside its cell so the field
      // never reads as a grid. The dome doesn't rotate, so they hold still.
      float stars(vec3 dir) {
        vec3 sd = dir * 140.0;
        vec3 cell = floor(sd);
        vec3 f = fract(sd) - 0.5;
        float r = hash13(cell);
        float present = smoothstep(0.975, 0.992, r);
        vec3 off = vec3(hash13(cell + 11.0), hash13(cell + 23.0), hash13(cell + 37.0)) - 0.5;
        // 1.0 - smoothstep, not a reversed-edge smoothstep: GLSL leaves edge0 > edge1 undefined.
        float core = 1.0 - smoothstep(0.0, 0.075, length(f - off * 0.7));
        float mag = 0.35 + 0.65 * hash13(cell + 71.0); // vary the brightness
        return core * mag * present;
      }

      void main() {
        vec3 dir = normalize(vDir);
        float h = clamp(dir.y, 0.0, 1.0);
        vec3 zenith = uHorizon * 0.55 + vec3(0.0, 0.02, 0.08);
        vec3 sky = mix(uHorizon, zenith, pow(h, 0.6));
        float d = max(dot(dir, normalize(uSunDir)), 0.0);
        // Fade the field in after dusk and out toward the horizon haze, and let
        // the sun's halo wash out anything near it.
        float fade = uNight * smoothstep(-0.02, 0.28, dir.y) * (1.0 - smoothstep(0.6, 0.98, d));
        sky += vec3(0.86, 0.9, 1.0) * stars(dir) * fade;
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
    update(camPos, horizon, sunColor, sunDir, sunVis, night) {
      mesh.position.copy(camPos)
      ;(mat.uniforms.uHorizon.value as THREE.Color).setHex(horizon)
      ;(mat.uniforms.uSun.value as THREE.Color).setHex(sunColor)
      ;(mat.uniforms.uSunDir.value as THREE.Vector3).copy(sunDir).normalize()
      mat.uniforms.uSunVis.value = sunVis
      mat.uniforms.uNight.value = night
    },
    setVisible(on) {
      mesh.visible = on
    },
  }
}
