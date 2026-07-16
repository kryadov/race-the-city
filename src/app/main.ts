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
import { applyDayNight } from './daynight'
import { createLoading } from '../ui/loading'
import { createVersionBadge } from '../ui/version'
import { createSettingsMenu } from '../ui/settingsMenu'
import { createMinimap } from '../ui/minimap'
import { createRoadLabels } from '../ui/roadLabels'
import { createTouchControls } from '../ui/touchControls'
import { getDefaultCity, setDefaultCity, getRoadLabels, setRoadLabels } from './prefs'
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
import { buildWater } from '../world/water'
import { buildGreenery } from '../world/greenery'
import { buildSea } from '../world/sea'
import { SpatialGrid } from '../physics/grid'
import { createCar, stepCar, type CarState } from '../vehicle/car'
import { Keyboard } from '../vehicle/input'
import { VEHICLES, type VehicleType } from '../vehicle/vehicles'
import { buildVehicleMesh } from '../vehicle/model'

const RADIUS = 1000

const app = document.getElementById('app')!
const ui = document.getElementById('ui')!
const stage: Stage = createStage(app)
const loading = createLoading(ui)
const minimap = createMinimap(ui)
const roadLabels = createRoadLabels(ui)
roadLabels.setEnabled(getRoadLabels())
createVersionBadge(ui)
const keyboard = new Keyboard()
const touch = createTouchControls(ui)
const theme = new ThemeController(stage)
const audio = new AudioEngine()
const resumeAudio = (): void => audio.resume()
window.addEventListener('pointerdown', resumeAudio, { once: true })
window.addEventListener('keydown', resumeAudio, { once: true })
let vehicle: VehicleType = 'car'
let prevForward = 0
const CYCLE_SECONDS = 240 // full day/night cycle
let timeOfDay = 0.35 // start mid-morning
setVehicleMesh(stage, buildVehicleMesh(vehicle))

let worldGroup: import('three').Object3D[] = []
let car: CarState | null = null
let grid = new SpatialGrid([], 25)
let provider: ElevationProvider = new FlatProvider()
let stopLoop: (() => void) | null = null
let loading_ = false

async function loadCity(query: string): Promise<void> {
  if (loading_) return
  loading_ = true
  try {
    loading.show(t('loading.geocoding'))
    const center = await geocode(query)
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

    const ground = buildGround(provider, RADIUS, 160)
    const { mesh: buildingsMesh, footprints } = buildBuildings(world.buildings, provider)
    const normalRoads = world.roads.filter((r) => !r.bridge && !r.tunnel)
    const roadsMesh = buildRoads(normalRoads, provider)
    const bridgesMesh = buildRoads(world.roads.filter((r) => r.bridge), provider, { lift: 4, color: 0x55555f })
    const tunnelsMesh = buildRoads(world.roads.filter((r) => r.tunnel && !r.bridge), provider, { color: 0x24242a })
    const railsMesh = buildRailways(world.railways, provider)
    const waterMesh = buildWater(world.water, provider)
    const greenMesh = buildGreenery(world.green, world.trees, provider)
    const seaMesh = buildSea(world.coast, RADIUS, provider)
    for (const obj of [ground, seaMesh, greenMesh, waterMesh, railsMesh, tunnelsMesh, roadsMesh, bridgesMesh, buildingsMesh]) {
      stage.scene.add(obj)
      worldGroup.push(obj)
    }
    theme.setWorld({ ground, buildings: buildingsMesh, roads: roadsMesh })
    minimap.setWorld(world.roads, footprints, world.water, world.green, RADIUS)
    roadLabels.setWorld(world.roads, provider)

    grid = new SpatialGrid(footprints, 25)
    car = createCar(0, 0)
    car.y = provider.heightAt(0, 0)

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
        audio.updateEngine(Math.min(1, Math.abs(fwd) / spec.maxSpeed))
        audio.updateSkid(Math.min(1, Math.abs(lat) / 8))
        if (Math.abs(fwd) - Math.abs(prevForward) < -6) audio.thud() // sudden drop ≈ impact
        prevForward = fwd
        timeOfDay = (timeOfDay + dt / CYCLE_SECONDS) % 1
        applyDayNight(stage, timeOfDay, theme.current === 'neon')
        menu.setTime(timeOfDay)
        syncCamera(stage, car, dt, provider)
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
  },
  {
    onLoadCity: (q) => void loadCity(q),
    onSetDefaultCity: (q) => setDefaultCity(q),
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
  },
)
theme.onChange = (mode) => menu.setViewMode(mode)

const clampCamDist = (d: number): number => Math.min(CAM_DIST_MAX, Math.max(CAM_DIST_MIN, d))
window.addEventListener('keydown', (e) => {
  const tgt = e.target as HTMLElement | null
  if (tgt && (tgt.tagName === 'INPUT' || tgt.isContentEditable)) return // ignore while typing a city
  if (e.key === '+' || e.key === '=') stage.camDist = clampCamDist(stage.camDist - CAM_DIST_STEP) // zoom in
  else if (e.key === '-' || e.key === '_') stage.camDist = clampCamDist(stage.camDist + CAM_DIST_STEP) // zoom out
  else if (!e.repeat && e.key.toLowerCase() === 'v') theme.toggle()
})
void loadCity(getDefaultCity())
