import * as THREE from 'three'
import {
  createStage,
  syncCamera,
  CAM_DIST_MIN,
  CAM_DIST_MAX,
  CAM_DIST_STEP,
  type Stage,
} from './scene'
import { startLoop } from './loop'
import { ThemeController } from './theme'
import { createCityInput } from '../ui/cityInput'
import { createLoading } from '../ui/loading'
import { createVersionBadge } from '../ui/version'
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
import { buildRoads } from '../world/roads'
import { SpatialGrid } from '../physics/grid'
import { createCar, stepCar, type CarState } from '../vehicle/car'
import { Keyboard } from '../vehicle/input'

const RADIUS = 1000

const app = document.getElementById('app')!
const ui = document.getElementById('ui')!
const stage: Stage = createStage(app)
const loading = createLoading(ui)
createVersionBadge(ui)
const keyboard = new Keyboard()
const theme = new ThemeController(stage)

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
    const roadsMesh = buildRoads(world.roads, provider)
    for (const obj of [ground, buildingsMesh, roadsMesh]) {
      stage.scene.add(obj)
      worldGroup.push(obj)
    }
    theme.setWorld({ ground, buildings: buildingsMesh, roads: roadsMesh })

    grid = new SpatialGrid(footprints, 25)
    car = createCar(0, 0)
    car.y = provider.heightAt(0, 0)

    loading.hide()

    if (!stopLoop) {
      stopLoop = startLoop((dt) => {
        if (!car) return
        car = stepCar(car, keyboard.read(), dt, grid, provider)
        syncCamera(stage, car, dt)
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

const cityUi = createCityInput(ui, (q) => void loadCity(q), () => theme.toggle())
theme.onChange = (mode) => cityUi.setViewMode(mode)
const clampCamDist = (d: number): number => Math.min(CAM_DIST_MAX, Math.max(CAM_DIST_MIN, d))
window.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement | null
  if (t && (t.tagName === 'INPUT' || t.isContentEditable)) return // ignore while typing a city
  if (e.key === '+' || e.key === '=') stage.camDist = clampCamDist(stage.camDist - CAM_DIST_STEP) // zoom in
  else if (e.key === '-' || e.key === '_') stage.camDist = clampCamDist(stage.camDist + CAM_DIST_STEP) // zoom out
  else if (!e.repeat && e.key.toLowerCase() === 'v') theme.toggle()
})
void loadCity('Monte Carlo')
