import * as THREE from 'three'

export type Weather = 'clear' | 'rain' | 'snow' | 'fog'
export const WEATHERS: readonly Weather[] = ['clear', 'rain', 'snow', 'fog']

/** The menu setting: a fixed weather, or 'auto' to cycle through them over time. */
export type WeatherSetting = Weather | 'auto'
export const WEATHER_SETTINGS: readonly WeatherSetting[] = ['auto', 'clear', 'rain', 'snow', 'fog']

const AREA = 55 // horizontal half-extent of the (camera-local) particle box
const TOP = 42
const BOT = -30
const RAIN_N = 700
const SNOW_N = 1100
const STREAK = 1.6 // rain drop length

export interface WeatherFx {
  setWeather(w: Weather): void
  update(cam: THREE.Vector3, dt: number): void
}

/**
 * Rain (line-segment streaks) and snow (points), kept in a camera-local box so
 * they always surround the view without batchy respawns. Per-particle speeds
 * avoid synchronized "sheets". Plus a thick-fog mode. One draw call per layer.
 */
export function createWeather(scene: THREE.Scene, fog: THREE.Fog, density = 1): WeatherFx {
  const fogNear = fog.near
  const fogFar = fog.far
  const rnd = (): number => Math.random() * 2 - 1
  // Particle counts scale with the render-quality tier (fill rate is the cost).
  const rainN = Math.max(80, Math.floor(RAIN_N * density))
  const snowN = Math.max(80, Math.floor(SNOW_N * density))

  // --- rain: LineSegments, 2 verts per drop ---
  const rainPos = new Float32Array(rainN * 6)
  const rainSpeed = new Float32Array(rainN)
  for (let i = 0; i < rainN; i++) {
    const x = rnd() * AREA
    const z = rnd() * AREA
    const y = Math.random() * (TOP - BOT) + BOT
    rainSpeed[i] = 50 + Math.random() * 35
    rainPos.set([x, y, z, x, y - STREAK, z], i * 6)
  }
  const rainGeo = new THREE.BufferGeometry()
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3))
  const rain = new THREE.LineSegments(
    rainGeo,
    new THREE.LineBasicMaterial({ color: 0x9fb4d8, transparent: true, opacity: 0.4 }),
  )
  rain.frustumCulled = false
  rain.visible = false
  scene.add(rain)

  // --- snow: Points ---
  const snowPos = new Float32Array(snowN * 3)
  const snowSpeed = new Float32Array(snowN)
  const snowPhase = new Float32Array(snowN)
  for (let i = 0; i < snowN; i++) {
    snowPos.set([rnd() * AREA, Math.random() * (TOP - BOT) + BOT, rnd() * AREA], i * 3)
    snowSpeed[i] = 2.5 + Math.random() * 3
    snowPhase[i] = Math.random() * Math.PI * 2
  }
  const snowGeo = new THREE.BufferGeometry()
  snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3))
  const snow = new THREE.Points(
    snowGeo,
    new THREE.PointsMaterial({ color: 0xffffff, size: 0.32, sizeAttenuation: true, transparent: true, opacity: 0.8, depthWrite: false }),
  )
  snow.frustumCulled = false
  snow.visible = false
  scene.add(snow)

  let current: Weather = 'clear'
  let t = 0

  return {
    setWeather(w) {
      current = w
      rain.visible = w === 'rain'
      snow.visible = w === 'snow'
      if (w === 'fog') {
        fog.near = 15
        fog.far = 170
      } else {
        fog.near = fogNear
        fog.far = fogFar
      }
    },

    update(cam, dt) {
      t += dt
      if (current === 'rain') {
        rain.position.copy(cam) // whole cloud follows the camera
        for (let i = 0; i < rainN; i++) {
          const j = i * 6
          const d = rainSpeed[i] * dt
          rainPos[j + 1] -= d
          rainPos[j + 4] -= d
          if (rainPos[j + 1] < BOT) {
            const x = rnd() * AREA
            const z = rnd() * AREA
            rainPos.set([x, TOP, z, x, TOP - STREAK, z], j)
          }
        }
        rainGeo.attributes.position.needsUpdate = true
      } else if (current === 'snow') {
        snow.position.copy(cam)
        for (let i = 0; i < snowN; i++) {
          const j = i * 3
          snowPos[j + 1] -= snowSpeed[i] * dt
          snowPos[j] += Math.sin(t * 1.5 + snowPhase[i]) * 0.4 * dt // gentle sway
          if (snowPos[j + 1] < BOT) {
            snowPos[j] = rnd() * AREA
            snowPos[j + 1] = TOP
            snowPos[j + 2] = rnd() * AREA
          }
        }
        snowGeo.attributes.position.needsUpdate = true
      }
    },
  }
}
