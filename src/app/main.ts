import * as THREE from 'three'
import {
  createStage,
  syncCamera,
  setVehicleMesh,
  CAM_DIST_MIN,
  CAM_DIST_MAX,
  CAM_DIST_STEP,
  type Stage,
} from './scene'
import { startLoop } from './loop'
import { ThemeController } from './theme'
import { applyDayNight, sampleDayNight, sunElevation } from './daynight'
import { createDriftFx } from './driftfx'
import { createWeather } from './weather'
import { createClouds } from './clouds'
import { createSky } from './sky'
import { createLoading } from '../ui/loading'
import { createVersionBadge } from '../ui/version'
import { createHud } from '../ui/hud'
import { createSettingsMenu } from '../ui/settingsMenu'
import { createMinimap } from '../ui/minimap'
import { createRoadLabels } from '../ui/roadLabels'
import { createTouchControls } from '../ui/touchControls'
import {
  getDefaultCity,
  setDefaultCity,
  getRoadLabels,
  setRoadLabels,
  getDriftFx,
  setDriftFx,
  getHud,
  setHud,
  getShadows,
  setShadows,
  getWeather,
  setWeather,
  getClouds,
  setClouds,
  getRoadDetail,
  setRoadDetail,
  getZoom,
  setZoom,
  resetSettings,
} from './prefs'
import { AudioEngine } from '../audio/audio'
import { t } from '../i18n/i18n'
import { geocode } from '../geo/geocode'
import { bboxAround, fetchOsm } from '../geo/overpass'
import { bboxKey, cacheGet, cachePut } from '../geo/cache'
import { parseOsm } from '../geo/parse'
import { Projector } from '../geo/project'
import { loadTerrarium } from '../terrain/terrarium'
import { FlatProvider } from '../terrain/flat'
import type { ElevationProvider } from '../terrain/provider'
import { buildGround } from '../world/ground'
import { buildBuildings } from '../world/buildings'
import { buildRoads, buildRailways } from '../world/roads'
import { buildRoadDetail, LAMP_MAT, POOL_MAT } from '../world/roadDetail'
import { buildWater } from '../world/water'
import { buildGreenery } from '../world/greenery'
import { buildSea } from '../world/sea'
import { SpatialGrid } from '../physics/grid'
import { createCar, stepCar, type CarState } from '../vehicle/car'
import { Keyboard } from '../vehicle/input'
import { VEHICLES, type VehicleType } from '../vehicle/vehicles'
import {
  buildVehicleMesh,
  REAR_LIGHT_MAT,
  REAR_LIGHT_IDLE,
  REAR_LIGHT_BRAKE,
  TURN_LEFT_MAT,
  TURN_RIGHT_MAT,
} from '../vehicle/model'

const RADIUS = 1000
const sunScratch = new THREE.Vector3()

const app = document.getElementById('app')!
const ui = document.getElementById('ui')!
const stage: Stage = createStage(app)
stage.sun.castShadow = getShadows()
const loading = createLoading(ui)
const minimap = createMinimap(ui)
const roadLabels = createRoadLabels(ui)
roadLabels.setEnabled(getRoadLabels())
const hud = createHud(ui)
hud.setVisible(getHud())
createVersionBadge(ui)
const keyboard = new Keyboard()
const touch = createTouchControls(ui)
const theme = new ThemeController(stage)
const driftFx = createDriftFx(stage.scene)
driftFx.setEnabled(getDriftFx())
const headlight = new THREE.SpotLight(0xfff2c0, 0, 70, Math.PI / 5, 0.5, 1.2)
stage.scene.add(headlight, headlight.target)
const weather = createWeather(stage.scene, stage.scene.fog as THREE.Fog)
weather.setWeather(getWeather())
const clouds = createClouds(stage.scene)
clouds.setEnabled(getClouds())
const sky = createSky(stage.scene)
const sunDir = new THREE.Vector3()
const audio = new AudioEngine()
const resumeAudio = (): void => audio.resume()
window.addEventListener('pointerdown', resumeAudio, { once: true })
window.addEventListener('keydown', resumeAudio, { once: true })
let vehicle: VehicleType = 'car'
let prevForward = 0
let steerDir = 0 // sign of the currently-held steer
let steerHold = 0 // seconds that direction has been held
let blinkClock = 0 // free-running clock for the indicator blink
const CYCLE_SECONDS = 240 // full day/night cycle
let timeOfDay = 0.35 // start mid-morning
setVehicleMesh(stage, buildVehicleMesh(vehicle))

let worldGroup: import('three').Object3D[] = []
let roadDetailMesh: import('three').Object3D | null = null
let car: CarState | null = null
let grid = new SpatialGrid([], 25)
let provider: ElevationProvider = new FlatProvider()
let stopLoop: (() => void) | null = null
let loading_ = false

async function loadCity(query: string): Promise<void> {
  if (loading_) return
  loading_ = true
  hud.setCity(query)
  try {
    loading.show(t('loading.geocoding'))
    const center = await geocode(query)
    // reflect the loaded city in the address bar so the URL is shareable
    const u = new URL(location.href)
    u.searchParams.set('city', query)
    history.replaceState(null, '', u)
    const projector = new Projector(center)
    const bbox = bboxAround(center, RADIUS)

    loading.show(t('loading.osm'))
    const key = bboxKey(bbox)
    let osm = await cacheGet(key)
    if (!osm) {
      osm = await fetchOsm(bbox)
      await cachePut(key, osm)
    }
    const world = parseOsm(osm, projector)

    loading.show(t('loading.terrain'))
    try {
      provider = await loadTerrarium(center, bbox, projector)
    } catch {
      provider = new FlatProvider() // graceful fallback
    }

    // clear previous world (and free its GPU resources)
    for (const obj of worldGroup) {
      stage.scene.remove(obj)
      obj.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (mesh.geometry) mesh.geometry.dispose()
        const mat = mesh.material
        if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((m) => m.dispose())
      })
    }
    worldGroup = []

    const ground = buildGround(provider, RADIUS, world.green, 160)
    const { mesh: buildingsMesh, footprints } = buildBuildings(world.buildings, provider)
    const normalRoads = world.roads.filter((r) => !r.bridge && !r.tunnel)
    const roadsMesh = buildRoads(normalRoads, provider)
    const bridgesMesh = buildRoads(world.roads.filter((r) => r.bridge), provider, { lift: 4, color: 0x55555f })
    const tunnelsMesh = buildRoads(world.roads.filter((r) => r.tunnel && !r.bridge), provider, { color: 0x24242a })
    const railsMesh = buildRailways(world.railways, provider)
    roadDetailMesh = buildRoadDetail(world.roads, provider)
    roadDetailMesh.visible = getRoadDetail()
    const waterMesh = buildWater(world.water, provider)
    const greenMesh = buildGreenery(world.green, world.trees, provider)
    const seaMesh = buildSea(world.coast, RADIUS, provider)
    ground.receiveShadow = true
    roadsMesh.receiveShadow = true
    buildingsMesh.traverse((o) => {
      o.castShadow = true
      o.receiveShadow = true
    })
    greenMesh.traverse((o) => {
      o.castShadow = true
    })
    for (const obj of [ground, seaMesh, greenMesh, waterMesh, railsMesh, tunnelsMesh, roadsMesh, bridgesMesh, roadDetailMesh, buildingsMesh]) {
      stage.scene.add(obj)
      worldGroup.push(obj)
    }
    theme.setWorld({ ground, buildings: buildingsMesh, roads: roadsMesh, greenery: greenMesh, roadDetail: roadDetailMesh })
    minimap.setWorld(world.roads, footprints, world.water, world.green, RADIUS)
    roadLabels.setWorld(world.roads, provider)

    grid = new SpatialGrid(footprints, 25)
    car = createCar(0, 0)
    car.y = provider.heightAt(0, 0)
    driftFx.reset()

    loading.hide()

    if (!stopLoop) {
      stopLoop = startLoop((dt) => {
        if (!car) return
        const spec = VEHICLES[vehicle]
        const kb = keyboard.read()
        const tc = touch.read()
        const input = {
          throttle: Math.max(-1, Math.min(1, kb.throttle + tc.throttle)),
          steer: Math.max(-1, Math.min(1, kb.steer + tc.steer)),
          brake: kb.brake || tc.brake,
        }
        car = stepCar(car, input, dt, grid, provider, spec)
        const fwd = car.vx * Math.cos(car.heading) + car.vz * Math.sin(car.heading)
        const lat = -car.vx * Math.sin(car.heading) + car.vz * Math.cos(car.heading)
        hud.setSpeed(Math.abs(fwd) * 3.6)
        audio.updateEngine(Math.min(1, Math.abs(fwd) / spec.maxSpeed))
        audio.updateSkid(Math.min(1, Math.abs(lat) / 8))
        if (Math.abs(fwd) - Math.abs(prevForward) < -6) audio.thud() // sudden drop ≈ impact
        // brake lights: handbrake, or throttling backwards while still rolling forward
        const braking = input.brake || (input.throttle < 0 && fwd > 1)
        REAR_LIGHT_MAT.emissiveIntensity = braking ? REAR_LIGHT_BRAKE : REAR_LIGHT_IDLE
        // turn signals: blink once a steer has been held the same way for >1s
        const sdir = input.steer > 0.3 ? 1 : input.steer < -0.3 ? -1 : 0
        if (sdir !== 0 && sdir === steerDir) steerHold += dt
        else {
          steerDir = sdir
          steerHold = sdir !== 0 ? dt : 0
        }
        blinkClock += dt
        const blinkOn = steerHold > 0.5 && Math.floor(blinkClock / 0.4) % 2 === 0
        TURN_RIGHT_MAT.emissiveIntensity = blinkOn && steerDir > 0 ? 2.4 : 0
        TURN_LEFT_MAT.emissiveIntensity = blinkOn && steerDir < 0 ? 2.4 : 0
        prevForward = fwd
        driftFx.update(car, dt, provider)
        timeOfDay = (timeOfDay + dt / CYCLE_SECONDS) % 1
        applyDayNight(stage, timeOfDay, theme.current === 'neon')
        // keep the sun's shadow frustum centred on the car
        sunScratch.copy(stage.sun.position).normalize().multiplyScalar(240)
        stage.sun.position.set(car.x + sunScratch.x, car.y + sunScratch.y, car.z + sunScratch.z)
        stage.sun.target.position.set(car.x, car.y, car.z)
        stage.sun.target.updateMatrixWorld()
        menu.setTime(timeOfDay)
        const night = Math.max(0, Math.min(1, (0.12 - sunElevation(timeOfDay)) / 0.45))
        headlight.intensity = night * 4
        LAMP_MAT.emissiveIntensity = night * 1.6 // street lamps glow after dusk
        POOL_MAT.opacity = night * 0.5 // and throw a soft pool of light on the road
        if (night > 0) {
          const hx = Math.cos(car.heading), hz = Math.sin(car.heading)
          headlight.position.set(car.x + hx * 2, car.y + 1.3, car.z + hz * 2)
          headlight.target.position.set(car.x + hx * 24, car.y, car.z + hz * 24)
          headlight.target.updateMatrixWorld()
        }
        syncCamera(stage, car, dt, provider)
        // sky dome: gradient + sun disc following the cycle (hidden in neon, which paints its own flat bg)
        const skyOn = theme.current !== 'neon'
        sky.setVisible(skyOn)
        if (skyOn) {
          const s = sampleDayNight(timeOfDay)
          const sunVis = Math.max(0, Math.min(1, (sunElevation(timeOfDay) + 0.05) / 0.17))
          sunDir.copy(sunScratch).normalize()
          sky.update(stage.camera.position, s.sky, s.sun, sunDir, sunVis)
        }
        weather.update(stage.camera.position, dt)
        clouds.update(stage.camera.position, dt)
        minimap.update(car)
        roadLabels.update(stage.camera, car.x, car.z)
        stage.renderer.render(stage.scene, stage.camera)
      })
    }
  } catch (e) {
    const key = e instanceof Error && e.message === 'city not found' ? 'error.cityNotFound' : 'error.loadFailed'
    loading.error(t(key))
  } finally {
    loading_ = false
  }
}

const menu = createSettingsMenu(
  ui,
  {
    city: getDefaultCity(),
    view: theme.current,
    vehicle,
    audio: audio.getState(),
    roadLabels: getRoadLabels(),
    time: timeOfDay,
    driftFx: getDriftFx(),
    hud: getHud(),
    shadows: getShadows(),
    clouds: getClouds(),
    roadDetail: getRoadDetail(),
    weather: getWeather(),
    zoom: getZoom(),
  },
  {
    onLoadCity: (q) => void loadCity(q),
    onSetDefaultCity: (q) => setDefaultCity(q),
    onShareCity: () => void navigator.clipboard?.writeText(location.href),
    onSetView: (mode) => theme.set(mode),
    onSelectVehicle: (type) => {
      vehicle = type
      setVehicleMesh(stage, buildVehicleMesh(type))
      if (car) {
        car.vx = 0 // reset momentum for the new handling
        car.vz = 0
      }
    },
    onAudioChange: (patch) => audio.setState(patch),
    onRoadLabels: (on) => {
      setRoadLabels(on)
      roadLabels.setEnabled(on)
    },
    onSetTime: (tt) => {
      timeOfDay = tt
    },
    onDriftFx: (on) => {
      setDriftFx(on)
      driftFx.setEnabled(on)
    },
    onHud: (on) => {
      setHud(on)
      hud.setVisible(on)
    },
    onShadows: (on) => {
      setShadows(on)
      stage.sun.castShadow = on
    },
    onClouds: (on) => {
      setClouds(on)
      clouds.setEnabled(on)
    },
    onRoadDetail: (on) => {
      setRoadDetail(on)
      if (roadDetailMesh) roadDetailMesh.visible = on
    },
    onWeather: (w) => {
      setWeather(w)
      weather.setWeather(w)
    },
    onZoom: (v) => {
      stage.camDist = clampCamDist(v)
      setZoom(stage.camDist)
    },
    onReset: () => {
      resetSettings()
      location.reload()
    },
  },
)
theme.onChange = (mode) => menu.setViewMode(mode)

const clampCamDist = (d: number): number => Math.min(CAM_DIST_MAX, Math.max(CAM_DIST_MIN, d))
stage.camDist = clampCamDist(getZoom()) // restore the saved zoom
const applyZoom = (d: number): void => {
  stage.camDist = clampCamDist(d)
  setZoom(stage.camDist)
  menu.setZoom(stage.camDist) // keep the menu slider in sync with the keys
}
window.addEventListener('keydown', (e) => {
  const tgt = e.target as HTMLElement | null
  if (tgt && (tgt.tagName === 'INPUT' || tgt.isContentEditable)) return // ignore while typing a city
  if (e.key === '+' || e.key === '=') applyZoom(stage.camDist - CAM_DIST_STEP) // zoom in
  else if (e.key === '-' || e.key === '_') applyZoom(stage.camDist + CAM_DIST_STEP) // zoom out
  else if (!e.repeat && e.key.toLowerCase() === 'v') theme.toggle()
})
// a ?city=… link opens straight to that city; otherwise the saved default
void loadCity(new URL(location.href).searchParams.get('city') || getDefaultCity())
