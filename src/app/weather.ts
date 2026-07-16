import * as THREE from 'three'

export type Weather = 'clear' | 'rain' | 'snow' | 'fog'
export const WEATHERS: readonly Weather[] = ['clear', 'rain', 'snow', 'fog']

const COUNT = 900
const AREA = 70 // horizontal half-extent around the camera
const TOP = 45 // spawn height above camera
const BOT = -35 // recycle below camera

interface Layer {
  points: THREE.Points
  geo: THREE.BufferGeometry
  pos: Float32Array
}

export interface WeatherFx {
  setWeather(w: Weather): void
  update(cam: THREE.Vector3, dt: number): void
}

/** Rain/snow particle layers around the camera, plus a thick-fog mode. */
export function createWeather(scene: THREE.Scene, fog: THREE.Fog): WeatherFx {
  const fogNear = fog.near
  const fogFar = fog.far

  const makeLayer = (color: number, size: number): Layer => {
    const pos = new Float32Array(COUNT * 3)
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * AREA
      pos[i * 3 + 1] = Math.random() * (TOP - BOT) + BOT
      pos[i * 3 + 2] = (Math.random() * 2 - 1) * AREA
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const mat = new THREE.PointsMaterial({
      color,
      size,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    })
    const points = new THREE.Points(geo, mat)
    points.frustumCulled = false
    points.visible = false
    scene.add(points)
    return { points, geo, pos }
  }

  const rain = makeLayer(0xafc4e0, 0.5)
  const snow = makeLayer(0xffffff, 1.3)
  let current: Weather = 'clear'

  return {
    setWeather(w) {
      current = w
      rain.points.visible = w === 'rain'
      snow.points.visible = w === 'snow'
      if (w === 'fog') {
        fog.near = 15
        fog.far = 170
      } else {
        fog.near = fogNear
        fog.far = fogFar
      }
    },

    update(cam, dt) {
      const layer = current === 'rain' ? rain : current === 'snow' ? snow : null
      if (!layer) return
      const speed = current === 'rain' ? 55 : 4
      const drift = current === 'rain' ? 1 : 4
      const p = layer.pos
      for (let i = 0; i < COUNT; i++) {
        const j = i * 3
        p[j + 1] -= speed * dt
        p[j] += (Math.random() - 0.5) * drift * dt
        if (p[j + 1] - cam.y < BOT) {
          p[j + 1] = cam.y + TOP
          p[j] = cam.x + (Math.random() * 2 - 1) * AREA
          p[j + 2] = cam.z + (Math.random() * 2 - 1) * AREA
        }
        if (Math.abs(p[j] - cam.x) > AREA * 1.4) p[j] = cam.x + (Math.random() * 2 - 1) * AREA
        if (Math.abs(p[j + 2] - cam.z) > AREA * 1.4) p[j + 2] = cam.z + (Math.random() * 2 - 1) * AREA
      }
      layer.geo.attributes.position.needsUpdate = true
    },
  }
}
