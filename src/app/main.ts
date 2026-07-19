import * as THREE from 'three'
import {
  createStage,
  syncCamera,
  setVehicleMesh,
  CAM_DIST_MIN,
  CAM_DIST_MAX,
  CAM_DIST_STEP,
  applyQuality,
  densityFor,
  type Stage,
} from './scene'
import { startLoop } from './loop'
import { ThemeController } from './theme'
import { applyDayNight, sampleDayNight, sunElevation, DAY_TIME, NIGHT_TIME, type TimeMode } from './daynight'
import { createDriftFx } from './driftfx'
import { createWeather, WEATHERS, type WeatherSetting } from './weather'
import { createClouds } from './clouds'
import { createSky } from './sky'
import { burn, speedFactor, CAN_WORTH } from '../vehicle/fuel'
import { createNitro } from './nitro'
import { createCans } from './cans'
import { createFireworks } from './fireworks'
import { createBubbles } from '../fx/bubbles'
import { createNitroFlame } from './nitroFlame'
import { withRetry, LOAD_ATTEMPTS } from './retry'
import { createLoading } from '../ui/loading'
import { createUpdateNotice } from '../ui/updateNotice'
import { createHud } from '../ui/hud'
import { createSettingsMenu } from '../ui/settingsMenu'
import { createMinimap } from '../ui/minimap'
import { createRoadLabels } from '../ui/roadLabels'
import { createTouchControls } from '../ui/touchControls'
import { createPauseButton } from '../ui/pauseButton'
import { createHelpOverlay } from '../ui/helpOverlay'
import { createStartMenu, type StartMode } from '../ui/startMenu'
import { pickRandomCity } from './cities'
import { createAutopilot } from './autopilot'
import { createTimeTrial } from './timeTrial'
import { createRivals } from './rivals'
import { createTrialHud } from '../ui/trialHud'
import { createTaxi } from './taxi'
import { createTaxiHud } from '../ui/taxiHud'
import { createReplay } from './replay'
import { createReplayControls } from '../ui/replayControls'
import { createAircraft } from './aircraft'
import { createBirds } from './birds'
import { countFor, crowdFor, gapFor, type Density } from './density'
import { createTrains, type Trains } from './trains'
import { createTraffic, type Traffic } from './traffic'
import { createPedestrians, type Pedestrians } from './pedestrians'
import { createBoats, type Boats } from './boats'
import { createLivestock, type Livestock } from './livestock'
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
  getTimeMode,
  setTimeMode,
  getClouds,
  setClouds,
  getRoadDetail,
  setRoadDetail,
  getNitro,
  setNitro,
  getDemo,
  setDemo,
  getTrial,
  setTrial,
  getRace,
  setRace,
  getDensity,
  setDensity,
  getQuality,
  setQuality,
  getUnits,
  setUnits,
  getZoom,
  setZoom,
  getSession,
  setSession,
  clearSession,
  resetSettings,
} from './prefs'
import { AudioEngine } from '../audio/audio'
import { t } from '../i18n/i18n'
import { geocode } from '../geo/geocode'
import { bboxAround, fetchOsm, overpassQuery } from '../geo/overpass'
import { bboxKey, cacheGet, cachePut } from '../geo/cache'
import { parseOsm } from '../geo/parse'
import { Projector } from '../geo/project'
import { loadTerrarium } from '../terrain/terrarium'
import { FlatProvider } from '../terrain/flat'
import { griddedProvider } from '../terrain/gridded'
import type { Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import { buildGround } from '../world/ground'
import { startPose } from '../world/start'
import { buildBuildings } from '../world/buildings'
import { buildRoads, buildRailways, roadWidth } from '../world/roads'
import { buildDecks, createDeckIndex, surfaceUnder, type DeckIndex } from '../world/bridge'
import { buildBridges } from '../world/bridgeMesh'
import { buildRoadDetail, LAMP_MAT, POOL_MAT } from '../world/roadDetail'
import { buildManholes } from '../world/manholes'
import { buildWater, waterLevel } from '../world/water'
import { buildParking } from '../world/parking'
import { buildProps, propFootprints, propTops } from '../world/props'
import { buildGreenery } from '../world/greenery'
import { buildStreetFurniture } from '../world/streetFurniture'
import { buildPoiMarkers } from '../world/poiMarkers'
import { buildSea } from '../world/sea'
import { rectBounds, confineToBounds } from '../world/bounds'
import { createMistWall } from '../world/mistWall'
import { SpatialGrid } from '../physics/grid'
import { roofUnder } from '../physics/collide'
import { pointInPolygon, resolveAgainstCircles, bounce, type Circle } from '../physics/collide'
import { createCar, stepCar, type CarState } from '../vehicle/car'
import { Keyboard } from '../vehicle/input'
import { VEHICLES, LEANS, HOVERS, HOVER_H, type VehicleType } from '../vehicle/vehicles'
import { BEACON_RED, BEACON_BLUE } from '../vehicle/models/parts'
import {
  buildVehicleMesh,
  wheelPrint,
  REAR_LIGHT_MAT,
  REAR_LIGHT_IDLE,
  REAR_LIGHT_BRAKE,
  TURN_LEFT_MAT,
  TURN_RIGHT_MAT,
} from '../vehicle/model'

const RADIUS = 1000
// The drivable edge. The world is built from a ±RADIUS *square* bbox, so the
// boundary is a square too (half-extents, centre→edge): a circle would leave the
// corner buildings outside it and brake you in the middle of the outer streets.
// The car brakes into the soft edge and stops at the hard one, just inside the
// ground rim; the mist wall stands a few metres past it. Built against a
// `WorldBounds` shape so a real OSM admin boundary can drop in later.
const EDGE_SOFT = 965
const EDGE_HARD = 990
const bounds = rectBounds(EDGE_SOFT, EDGE_HARD)
// The ground mesh's resolution. Everything that sits on the ground is sampled
// through griddedProvider at this same figure, so the surface the car drives on
// is the surface on screen — keep the two together or the car sinks again.
const GROUND_SEGMENTS = 160
const sunScratch = new THREE.Vector3()

const app = document.getElementById('app')!
const ui = document.getElementById('ui')!
const quality = getQuality()
const stage: Stage = createStage(app, quality)
applyQuality(stage, quality, getShadows())
const loading = createLoading(ui)
const minimap = createMinimap(ui)
const roadLabels = createRoadLabels(ui)
roadLabels.setEnabled(getRoadLabels())
const hud = createHud(ui, getUnits())
let odometer = 0 // metres driven, carried in the session
// The start screen is up: a city drives itself as a backdrop, the player's
// driving input is ignored, and the autopilot is forced on. Cleared on Play.
let attract = true
hud.setVisible(getHud())
const keyboard = new Keyboard()
const touch = createTouchControls(ui)
const theme = new ThemeController(stage)
// The mist wall rings the world's edge — one object, built once and standing
// through every city (it depends on the fixed edge, not on the city geometry).
// Its colour tracks the fog each frame (see the loop), so it stays right through
// day, night and neon without a ThemeController hook.
const mist = createMistWall(EDGE_HARD + 4)
stage.scene.add(mist.object)
const driftFx = createDriftFx(stage.scene)
driftFx.setEnabled(getDriftFx())
const headlight = new THREE.SpotLight(0xfff2c0, 0, 70, Math.PI / 5, 0.5, 1.2)
stage.scene.add(headlight, headlight.target)
const weather = createWeather(stage.scene, stage.scene.fog as THREE.Fog, densityFor(quality))
const AUTO_WEATHER_PERIOD = 150 // seconds each weather holds before auto-cycling (rare changes)
let autoWeather = false
let autoWeatherTimer = 0
let autoWeatherIdx = 0
/** How much cloud each sort of weather brings with it. */
const CLOUD_COVER: Record<string, number> = { clear: 0, rain: 1, snow: 0.85, fog: 0.6 }

/** Set the weather and the sky that goes with it. Never one without the other. */
function showWeather(w: (typeof WEATHERS)[number]): void {
  weather.setWeather(w)
  clouds.setCover(CLOUD_COVER[w] ?? 0)
}

function applyWeatherSetting(s: WeatherSetting): void {
  if (s === 'auto') {
    autoWeather = true
    autoWeatherTimer = 0
    autoWeatherIdx = 0
    showWeather(WEATHERS[0])
  } else {
    autoWeather = false
    showWeather(s) // not 'auto' here: that is the branch above
  }
}
const clouds = createClouds(stage.scene)
clouds.setEnabled(getClouds())
// After the clouds exist: applying the weather now sets the sky to match, and
// this runs at module scope, where a const declared below is still in its
// temporal dead zone. Reaching it through a function hides that from the
// compiler — it threw at startup and took the whole app with it.
applyWeatherSetting(getWeather())
const sky = createSky(stage.scene)
const sunDir = new THREE.Vector3()
const nitro = createNitro(stage.scene)
nitro.setEnabled(getNitro())
const cans = createCans(stage.scene)
let fuel = 1
const flame = createNitroFlame()
let density: Density = getDensity()
const sky2 = createAircraft(stage.scene, Math.random, gapFor(density, 1))
let lastTrees: Vec2[] = []
/** Where a bird may land: the ground, a tree, or a roof — all of which move city to city. */
const makeBirds = (): ReturnType<typeof createBirds> =>
  createBirds(stage.scene, Math.random, countFor(density, 8), provider, lastTrees, (x, z) =>
    roofUnder(x, z, grid),
  )
let trains: Trains | null = null
let traffic: Traffic | null = null
let people: Pedestrians | null = null
let boats: Boats | null = null
let herds: Livestock | null = null
const autopilot = createAutopilot()
autopilot.setEnabled(getDemo())
const trial = createTimeTrial(stage.scene)
const fireworks = createFireworks(stage.scene)
const bubbles = createBubbles(stage.scene)
const trialHud = createTrialHud(ui)
const taxi = createTaxi(stage.scene)
const taxiHud = createTaxiHud(ui)
const replay = createReplay()
const replayControls = createReplayControls(ui, {
  onRecordToggle: () => (replay.recording() ? replay.stopRec() : replay.startRec()),
  onPlay: () => replay.play(),
  onStopPlay: () => replay.stopPlay(),
})
trial.setEnabled(getTrial())
trialHud.setVisible(getTrial())
/** Build a vehicle, fit its nitro plume, and put it on stage. */
function showVehicle(type: VehicleType): void {
  const mesh = buildVehicleMesh(type)
  flame.attachTo(mesh) // before setVehicleMesh: the bbox is model-space only while untransformed
  driftFx.setPrint(wheelPrint(mesh)) // marks as wide as the tyres that lay them
  setVehicleMesh(stage, mesh)
}
/**
 * How far below a roof still counts as landing on it, in metres. A frame at
 * speed covers ground; without a little slack the car falls past the roofline
 * between two frames and lands in the street through the building.
 */
const ROOF_SNAP = 2.0
/**
 * How far the sight line must pass under a roof before the camera counts it as
 * blocked, and over one before it counts as clear again — metres.
 */
const CAM_GRAZE = 0.8
/** Whether the camera thought it was blocked last frame; hysteresis needs it. */
let camBlocked = false
/** How lively a shunt is: enough to stop you, not enough to launch you. */
const HIT_BOUNCE = 0.3
const HIT_BLEED = 0.55
const BOOST_TIME = 2.5 // seconds of nitro boost per pickup
const BOOST_MULT = 10 // top-speed multiplier at full boost
let boostTimer = 0
// Boost winds in and out rather than snapping: 10x arriving in one frame threw
// the car, and losing it as abruptly felt like hitting a wall. Spooling up is
// quicker than spooling down, the way a turbo behaves.
let boost = 0 // 0..1
let lastGate = 0 // to ring only on the frame a gate is taken
/** Where a finished lap's fireworks go off, relative to the car. */
const FINISH_BURSTS = [
  { x: -25, y: 40, z: -25 },
  { x: 25, y: 46, z: -18 },
  { x: 0, y: 38, z: 25 },
]
const BOOST_SPOOL_UP = 5 // per second
const BOOST_SPOOL_DOWN = 1.8
const audio = new AudioEngine()
const resumeAudio = (): void => audio.resume()
window.addEventListener('pointerdown', resumeAudio, { once: true })
window.addEventListener('keydown', resumeAudio, { once: true })
// Horn on H, for as long as it's held.
window.addEventListener('keydown', (e) => {
  if (e.key === 'h' || e.key === 'H') audio.horn(true)
})
window.addEventListener('keyup', (e) => {
  if (e.key === 'h' || e.key === 'H') audio.horn(false)
})
let vehicle: VehicleType = 'car'
let prevForward = 0
let lean = 0 // current bank angle (bikes only), eased toward the target
const MAX_LEAN = 0.5 // rad (~29°) at full steer and speed
let steerDir = 0 // sign of the currently-held steer
let steerHold = 0 // seconds that direction has been held
let steerVis = 0 // front-wheel angle, eased toward the input so it winds on with the hold
const STEER_EASE = 7 // per second; ~full lock after a third of a second held
let blinkClock = 0 // free-running clock for the indicator blink
/**
 * A full day and night, in seconds. Eight minutes: at four, you could not drive
 * across a city without the sun setting on you.
 */
const CYCLE_SECONDS = 480
// The clock runs ('cycle'), or holds at noon / midnight for a fixed-light drive.
let timeMode: TimeMode = getTimeMode()
let timeOfDay = timeMode === 'day' ? DAY_TIME : timeMode === 'night' ? NIGHT_TIME : 0.35
showVehicle(vehicle)
audio.setVehicle(vehicle)
// Pausing resets the engine's idle timer, so resuming doesn't start mid-fade.
createHelpOverlay(ui) // nothing else tells you the horn is on H
const pause = createPauseButton(ui, (paused) => {
  audio.setDucked(paused) // music drops but plays on
  audio.setVehicle(vehicle) // resets the engine's idle timer, so resuming doesn't start mid-fade
})

let worldGroup: import('three').Object3D[] = []
let roadDetailMesh: import('three').Object3D | null = null
let facades: import('../world/facade').FacadeMaterials | null = null
let tunnelSegs: { ax: number; az: number; bx: number; bz: number; r2: number }[] = []
let decks: DeckIndex = { heightAt: () => null }
// Buildings indexed for the camera-occlusion test, with their heights.
let occGrid = new SpatialGrid([], 25)
const occHeight = new Map<import('../geo/types').Vec2[], number>()
let car: CarState | null = null
let grid = new SpatialGrid([], 25)
let provider: ElevationProvider = new FlatProvider()
// After grid and provider, never above them: this reads both, and a `let`
// declared further down is still in its temporal dead zone at module scope. The
// boot check caught exactly this — the same trap that took the app down in
// v0.82.0, and the reason that check exists.
let birds = makeBirds()
const rivals = createRivals(stage.scene)
// Rivals race the trial's gates. Racing with the trial off would put three cars
// on a course that does not exist, so the switch only bites once both are on.
rivals.setEnabled(getRace() && getTrial())
let stopLoop: (() => void) | null = null
let loading_ = false
// A city requested while another is still loading is remembered here and run the
// moment that load finishes, rather than silently dropped. Clicking Play/Random/
// search on the start menu while the idle backdrop is still coming in must not be
// a no-op — that left the menu sitting there with the demo still driving under it.
let queued: string | null = null
// Set when a Play / Random / city-search click wants to *play* the city being
// loaded (not just watch it as the backdrop): the load drops out of attract and
// enters this mode once the car exists.
let playAfterLoad: StartMode | null = null
let startMode: StartMode = 'free' // the mode picked on the start menu, recorded via onMode
let errorDismiss: ReturnType<typeof setTimeout> | undefined // clears a load-failed notice after a few seconds
let currentCity = '' // the loaded city query, for session save/restore
let lastRoads: import('../geo/types').Road[] = [] // kept so the demo can re-home on demand
let lastRailways: import('../geo/types').Railway[] = []
let lastWater: import('../geo/types').Vec2[][] = []
let lastLat = 0 // the loaded city's latitude, so a density rebuild dresses the crowd for its season
// Each water body's surface height, cached per city (waterLevel samples the whole map — too dear per frame).
let waterLevels: { ring: import('../geo/types').Vec2[]; level: number }[] = []

async function loadCity(query: string): Promise<void> {
  if (loading_) {
    queued = query // fold into the current load; it runs the moment that one lands
    return
  }
  loading_ = true
  if (errorDismiss) {
    clearTimeout(errorDismiss) // a fresh load supersedes any lingering failure notice
    errorDismiss = undefined
  }
  replay.clear() // the recorded poses belong to the outgoing city
  hud.setCity(query)
  try {
    loading.show(t('loading.geocoding'), 0.05)
    const center = await withRetry(
      () => geocode(query),
      (n) => loading.show(`${t('loading.geocoding')} ${t('loading.retry')} ${n + 1}/${LOAD_ATTEMPTS}`, 0.05),
    )
    // reflect the loaded city in the address bar so the URL is shareable
    const u = new URL(location.href)
    u.searchParams.set('city', query)
    history.replaceState(null, '', u)
    const projector = new Projector(center)
    const bbox = bboxAround(center, RADIUS)

    loading.show(t('loading.osm'), 0.2)
    const key = bboxKey(bbox, overpassQuery(bbox))
    let osm = await cacheGet(key)
    if (!osm) {
      osm = await withRetry(
        () => fetchOsm(bbox),
        (n) => loading.show(`${t('loading.osm')} ${t('loading.retry')} ${n + 1}/${LOAD_ATTEMPTS}`, 0.2),
      )
      await cachePut(key, osm)
    }
    loading.show(t('loading.osm'), 0.5)
    const world = parseOsm(osm, projector)

    loading.show(t('loading.terrain'), 0.65)
    let dem: ElevationProvider
    try {
      dem = await withRetry(
        () => loadTerrarium(center, bbox, projector),
        (n) => loading.show(`${t('loading.terrain')} ${t('loading.retry')} ${n + 1}/${LOAD_ATTEMPTS}`, 0.65),
      )
    } catch {
      dem = new FlatProvider() // graceful fallback: flat ground beats no city
    }
    // Snap the DEM to the ground mesh's grid, so the car and everything else
    // sit on the surface that is actually drawn rather than on the raw data.
    provider = griddedProvider(dem, RADIUS, GROUND_SEGMENTS)
    loading.show(t('loading.build'), 0.85)

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

    const ground = buildGround(provider, RADIUS, world.green, GROUND_SEGMENTS)
    facades?.dispose() // the outgoing city's facade textures
    const { mesh: buildingsMesh, footprints, tops, facades: newFacades } = buildBuildings(world.buildings, provider)
    facades = newFacades
    const normalRoads = world.roads.filter((r) => !r.bridge && !r.tunnel)
    const bridgeRoads = world.roads.filter((r) => r.bridge)
    const roadsMesh = buildRoads(normalRoads, provider)
    // Decks are profiled to meet the ground at both ends, so they can be driven
    // onto — not stamped at a fixed lift with the road left underneath.
    const deckList = buildDecks(bridgeRoads, provider)
    decks = createDeckIndex(deckList)
    const bridgesMesh = buildBridges(deckList, provider)
    // Tunnels are not drawn. They run under the city, and painting one on the
    // surface lays a road into the side of whatever is built above it — Monaco
    // is full of them. Nothing else uses them either: no markings, no lamps, and
    // the traffic graph leaves them out, so nobody drives into a building.
    const tunnelsMesh = new THREE.Group()
    const railsMesh = buildRailways(world.railways, provider)
    // A bridge's markings, lamps and signs belong on its deck. Everything else
    // reads the terrain, so the road running *under* an overpass keeps its own.
    // Generous margin: lamps stand beside the carriageway and markings run to
    // its very edge, so a deck query at exactly the road's width misses them.
    // One index per bridge, not one of all of them: a road's markings and lamps
    // belong on ITS deck. Asking a single index hands a bridge running under a
    // flyover the flyover's height, and paints its markings ten metres above the
    // road they belong to — which is what you saw from underneath them.
    // `deckList` is built from `bridgeRoads` in order, so the indices line up.
    const ownDeck = deckList.map((d): ElevationProvider => {
      const only = createDeckIndex([d], 5)
      return { heightAt: (x, z) => only.heightAt(x, z) ?? provider.heightAt(x, z) }
    })
    const detail = new THREE.Group()
    detail.add(buildRoadDetail(normalRoads, provider))
    if (bridgeRoads.length) detail.add(buildRoadDetail(bridgeRoads, (r) => ownDeck[r] ?? provider))
    detail.add(buildManholes(normalRoads, provider)) // iron covers down the street centrelines
    roadDetailMesh = detail
    roadDetailMesh.visible = getRoadDetail()
    const waterMesh = buildWater(world.water, provider)
    // Cache each body's surface height once, so bubbles know how high to rise.
    waterLevels = world.water
      .filter((r) => r.length >= 3)
      .map((ring) => ({ ring, level: waterLevel(ring, provider) }))
    const parkingMesh = buildParking(world.parking, provider)
    const propsMesh = buildProps(world.props, provider)
    const furnitureMesh = buildStreetFurniture(world.benches, world.busStops, world.roads, provider)
    const poiMesh = buildPoiMarkers(world.pois, provider)
    const greenMesh = buildGreenery(world.green, world.trees, provider, center.lat, world.forests)
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
    for (const obj of [ground, seaMesh, greenMesh, waterMesh, parkingMesh, propsMesh, furnitureMesh, poiMesh, railsMesh, tunnelsMesh, roadsMesh, bridgesMesh, roadDetailMesh, buildingsMesh]) {
      stage.scene.add(obj)
      worldGroup.push(obj)
    }
    theme.setWorld({ ground, buildings: buildingsMesh, roads: roadsMesh, greenery: greenMesh, roadDetail: roadDetailMesh, streetFurniture: furnitureMesh, poiMarkers: poiMesh })
    minimap.setWorld(world.roads, footprints, world.water, world.green, RADIUS)
    roadLabels.setWorld(world.roads, provider)
    // index buildings (with heights) so the camera can tell when one blocks the car
    occHeight.clear()
    for (const b of world.buildings) occHeight.set(b.footprint, b.height)
    occGrid = new SpatialGrid(
      world.buildings.map((b) => b.footprint),
      25,
    )
    // collect tunnel segments so the camera can pull in when the car drives through one
    tunnelSegs = []
    for (const road of world.roads) {
      if (!road.tunnel) continue
      const r = roadWidth(road.kind) / 2 + 1
      for (let i = 0; i < road.points.length - 1; i++) {
        const a = road.points[i], b = road.points[i + 1]
        tunnelSegs.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, r2: r * r })
      }
    }
    boostTimer = 0
    boost = 0 // don't carry a live boost into the new city

    // Fountains and statues are as solid as walls; the grid takes polygons. It
    // takes their heights too, so a car with a jump in it can clear a bungalow
    // instead of being stopped in mid-air by ground it is nowhere near.
    grid = new SpatialGrid(
      footprints.concat(propFootprints(world.props)),
      25,
      tops.concat(propTops(world.props, provider)),
    )
    // On the nearest road, not on the spot the geocoder named: a geocoder names
    // a place, and Tokyo's is a building — you started inside it, against a wall.
    const start = startPose(normalRoads)
    car = createCar(start?.x ?? 0, start?.z ?? 0)
    car.heading = start?.heading ?? 0
    car.y = provider.heightAt(car.x, car.z) + (HOVERS[vehicle] ? HOVER_H : 0)
    // resume the saved pose if we're re-loading the same city
    const sess = getSession()
    odometer = 0
    if (sess && sess.city === query) {
      car.x = sess.x
      car.z = sess.z
      car.heading = sess.heading
      car.y = provider.heightAt(sess.x, sess.z) + (HOVERS[vehicle] ? HOVER_H : 0)
      odometer = sess.dist ?? 0
    }
    confineToBounds(car, bounds, 1 / 60) // a pose saved on a wider map lands inside the edge
    // scatter nitro pickups on road vertices around the car — must run after the
    // pose above is settled, so a resumed session gets bottles where it left off
    // On-map road vertices only: some OSM roads run past the ±RADIUS ground, and
    // a pickup scattered out there floats off the edge of the world. (Bridges are
    // skipped too — their points are the deck's, not the ground's.)
    const scatterOn = normalRoads
      .flatMap((r) => r.points)
      .filter((p) => Math.abs(p.x) <= RADIUS && Math.abs(p.z) <= RADIUS)
    cans.setSpots(scatterOn, provider, car.x, car.z)
    fuel = 1 // a new city starts with a full tank
    nitro.setSpots(
      scatterOn,
      provider,
      car.x,
      car.z,
    )
    hud.setDistance(odometer)
    trains?.dispose() // the outgoing city's trains ran on its railways
    trains = createTrains(stage.scene, world.railways, provider, Math.random, countFor(density, 5), world.roads)
    traffic?.dispose()
    traffic = createTraffic(stage.scene, world.roads, provider, Math.random, crowdFor(density, 16))
    people?.dispose()
    people = createPedestrians(stage.scene, world.roads, provider, Math.random, crowdFor(density, 22), world.water, center.lat)
    boats?.dispose()
    boats = createBoats(stage.scene, world.water, provider, Math.random, countFor(density, 4))
    herds?.dispose()
    herds = createLivestock(stage.scene, world.fields, provider)
    lastRoads = world.roads
    lastRailways = world.railways
    lastTrees = world.trees
    birds.dispose() // the outgoing city's trees and roofs were its perches
    birds = makeBirds()
    lastWater = world.water
    lastLat = center.lat
    autopilot.reset(world.roads, car)
    trial.reset(world.roads, provider, car)
    rivals.reset(world.roads, grid, provider, car, trial.course())
    taxi.reset(world.roads, provider, car) // a fresh fare in the new city
    currentCity = query
    driftFx.reset()

    loading.show(t('loading.build'), 1)
    // warm-up: place the camera, precompile all shaders and upload geometry to the
    // GPU while the loader is still up, so the first gameplay frames don't stutter.
    syncCamera(stage, car, 0.016, provider, 0, !!HOVERS[vehicle])
    stage.renderer.compile(stage.scene, stage.camera)
    stage.renderer.render(stage.scene, stage.camera)
    loading.hide()
    startMenu.revealCity() // a city is on the canvas now — fade the animated boot backdrop

    // A Play / Random / city-search click asked to play THIS city: now that the
    // car exists, drop out of attract and enter the chosen mode. A newer city
    // request queued behind us supersedes it — that load enters play instead, so
    // leave the flag for it rather than driving the city we're about to replace.
    if (playAfterLoad !== null && queued === null) {
      enterPlay(playAfterLoad)
      playAfterLoad = null
    }

    if (!stopLoop) {
      stopLoop = startLoop((wallDt) => {
        if (!car) return
        // Pausing feeds the whole sim a zero step: the car, the clock, the
        // weather and the pickups all freeze together, and the scene keeps
        // drawing. The engine is silenced outright, since a zero step would
        // otherwise leave its idle timer — and its drone — exactly where it was.
        const dt = pause.paused() ? 0 : wallDt
        const spec = VEHICLES[vehicle]
        const frozen = pause.paused() || attract || replay.playing() // no player driving here
        const kb = frozen ? { throttle: 0, steer: 0, brake: false } : keyboard.read()
        const tc = frozen ? { throttle: 0, steer: 0, brake: false } : touch.read()
        let input = {
          throttle: Math.max(-1, Math.min(1, kb.throttle + tc.throttle)),
          steer: Math.max(-1, Math.min(1, kb.steer + tc.steer)),
          brake: kb.brake || tc.brake,
        }
        const handsOn = input.throttle !== 0 || input.steer !== 0 || input.brake
        // nitro: collecting a bottle boosts the top speed for a short window
        if (nitro.update(car.x, car.z, dt)) boostTimer = BOOST_TIME
        // petrol: a can fills a third of the tank, the throttle empties it
        if (cans.update(car.x, car.z, dt)) {
          fuel = Math.min(1, fuel + CAN_WORTH)
          audio.chime(false)
        }
        fuel = burn(fuel, input.throttle, dt)
        hud.setFuel(fuel)
        if (boostTimer > 0) boostTimer -= dt
        const boostTarget = boostTimer > 0 ? 1 : 0
        const spool = boostTarget > boost ? BOOST_SPOOL_UP : BOOST_SPOOL_DOWN
        boost += (boostTarget - boost) * (1 - Math.exp(-spool * dt))
        if (boost < 0.002) boost = 0
        // A dry tank takes the legs off the car; a boost puts them back and
        // then some, which is what a bottle of nitrous is for.
        const dry = speedFactor(fuel)
        const activeSpec =
          boost > 0
            ? {
                ...spec,
                maxSpeed: spec.maxSpeed * (1 + (BOOST_MULT - 1) * boost) * dry,
                accel: spec.accel * (1 + 2 * boost) * dry,
              }
            : dry < 1
              ? { ...spec, maxSpeed: spec.maxSpeed * dry, accel: spec.accel * dry }
              : spec
        flame.update(boost > 0.05, dt)
        if (trial.enabled()) {
          const st = trial.update(dt, car.x, car.z)
          trialHud.set(st)
          trialHud.setRace(rivals.enabled() ? rivals.update(dt, car, st.taken, trial.course()) : null)
          if (st.justFinished) {
            audio.chime(true) // a lap done rings higher than a gate
            // High and spread out, not overhead: the chase camera looks down at
            // the car from behind, so a burst at the bumper goes off out of shot.
            for (const b of FINISH_BURSTS) fireworks.fire(car.x + b.x, car.y + b.y, car.z + b.z)
          } else if (st.taken !== lastGate) audio.chime(false)
          lastGate = st.taken
        }
        if (taxi.enabled()) {
          const ts = taxi.update(dt, car.x, car.z)
          taxiHud.set(ts)
          if (ts.justDelivered) {
            audio.chime(true) // a fare delivered rings out
            for (const b of FINISH_BURSTS) fireworks.fire(car.x + b.x, car.y + b.y, car.z + b.z)
          } else if (ts.justFailed) {
            audio.thud() // meter ran out
          }
        }
        // Everything solid that moves: traffic, people, trains.
        const hazards: Circle[] = [
          ...(traffic?.obstacles() ?? []),
          ...(people?.obstacles() ?? []),
          ...(trains?.obstacles() ?? []),
        ]
        // The demo drives with the same three inputs a player has, through the
        // same physics — so it drifts, it hits things, and it sounds right. Any
        // touch of the controls hands the wheel straight back. It reads the
        // BOOSTED spec, or it would cruise past a nitro bottle without using it,
        // and the hazards, or it would drive into a train.
        if ((autopilot.enabled() || attract) && !pause.paused()) {
          if (handsOn) {
            // You've taken the wheel: the demo's route is from wherever it left
            // off, and steering back to it means aiming through whatever is now
            // in between — usually a building. Pick the route up from where the
            // car actually is instead.
            autopilot.rehome(car)
          } else {
            input = autopilot.drive(car, activeSpec.maxSpeed, hazards)
          }
        }
        // What counts as "the ground" for the car: a deck when it is already
        // riding one, terrain otherwise. Judged from last frame's height, so
        // driving *under* a bridge doesn't teleport the car up onto it. stepCar
        // reads this, so gravity and jumps work off decks too.
        const prevY = car.y
        const surface: ElevationProvider = {
          heightAt: (x, z) => {
            const below = surfaceUnder(x, z, prevY, provider.heightAt(x, z), decks)
            // A roof you are above is ground, the same way a deck is: you flew
            // over it, you may land on it. Judged from last frame's height, so
            // driving past a tower at street level does not hoist the car onto
            // it — you have to have got up there yourself.
            const roof = roofUnder(x, z, grid)
            return roof !== null && prevY >= roof - ROOF_SNAP ? Math.max(below, roof) : below
          },
        }
        if (replay.playing()) {
          // Retrace a recorded drive: set the pose straight from the clip and skip
          // the physics — playback is about where the car WENT, not re-simulating it.
          const p = replay.step(dt)
          if (p) car = { ...car, x: p.x, z: p.z, y: p.y, heading: p.heading, vx: 0, vz: 0, vy: 0 }
        } else {
          car = stepCar(car, input, dt, grid, surface, activeSpec)
          // Traffic and people are solid. They move, so they can't live in the
          // static grid: push the car out and bounce it off. You stop; they don't
          // get run over.
          const movers: Circle[] = hazards
          if (movers.length) {
            const freed = resolveAgainstCircles(car.x, car.z, spec.radius, movers)
            if (freed.hit) {
              car.x = freed.x
              car.z = freed.z
              // Knock whatever we rammed back too, not just the player. The normal
              // points from the thing hit toward the car, so the bot is shoved the
              // other way, harder the faster we drove into it (pre-bounce speed).
              const closing = Math.max(0, -(car.vx * freed.nx + car.vz * freed.nz))
              const shove = Math.min(3, 0.5 + closing * 0.12)
              traffic?.shove(car.x, car.z, -freed.nx, -freed.nz, shove)
              people?.shove(car.x, car.z, -freed.nx, -freed.nz, shove)
              const b = bounce(car.vx, car.vz, freed.nx, freed.nz, HIT_BOUNCE)
              car.vx = b.vx * HIT_BLEED
              car.vz = b.vz * HIT_BLEED
              if (Math.hypot(car.vx, car.vz) > 6) audio.thud() // a shunt you'd feel
            }
          }
          // Keep the car inside the world. The physics grid holds footprints, not
          // the map's edge, so nothing else stops you driving off into the void.
          confineToBounds(car, bounds, dt)
          replay.capture(car, dt) // records the pose only while recording; else a no-op
        }
        replayControls.set({
          recording: replay.recording(),
          playing: replay.playing(),
          hasClip: replay.hasClip(),
          duration: replay.duration(),
        })
        const onDeck = decks.heightAt(car.x, car.z) !== null && Math.abs(car.y - prevY) < 2.5
        const fwd = car.vx * Math.cos(car.heading) + car.vz * Math.sin(car.heading)
        const lat = -car.vx * Math.sin(car.heading) + car.vz * Math.cos(car.heading)
        hud.setSpeed(Math.abs(fwd) * 3.6)
        odometer += Math.hypot(car.vx, car.vz) * dt // ground distance travelled
        hud.setDistance(odometer)
        // Paused? Surface the exact pose so a bug screenshot is reproducible.
        hud.setDebug(
          pause.paused()
            ? `x ${car.x.toFixed(1)}  z ${car.z.toFixed(1)}  ${Math.round((((car.heading * 180) / Math.PI) % 360 + 360) % 360)}°`
            : null,
        )
        // Parked and hands off? The engine fades out after a few seconds.
        const driving = Math.abs(fwd) > 0.4 || input.throttle !== 0
        if (pause.paused()) audio.silenceEngine()
        else audio.updateEngine(Math.min(1, Math.abs(fwd) / spec.maxSpeed), dt, driving)
        audio.updateSkid(pause.paused() ? 0 : Math.min(1, Math.abs(lat) / 8))
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
        // Emergency beacons strobe red↔blue. The police / ambulance / fire-truck
        // roof bars share these two lens materials, so driving the intensities
        // here lights whichever emergency vehicle is on screen.
        const beaconOn = Math.floor(blinkClock * 6) % 2 === 0
        BEACON_RED.emissiveIntensity = beaconOn ? 3 : 0.15
        BEACON_BLUE.emissiveIntensity = beaconOn ? 0.15 : 3
        prevForward = fwd
        driftFx.update(car, dt, provider)
        if (timeMode === 'cycle') timeOfDay = (timeOfDay + dt / CYCLE_SECONDS) % 1
        applyDayNight(stage, timeOfDay, theme.current === 'neon')
        mist.setColor((stage.scene.fog as THREE.Fog).color) // veil matches the fog
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
        facades?.setNight(night) // windows come on behind them
        sky2.update(dt, stage.camera.position.x, stage.camera.position.z, night)
        birds.update(dt, stage.camera.position.x, stage.camera.position.z, car.x, car.z)
        trains?.update(dt, night)
        traffic?.update(dt, car.x, car.z, night, trains?.obstacles())
        people?.update(dt, car.x, car.z)
        boats?.update(dt)
        herds?.update(dt)
        // Bubbles stream off the car when it's sunk under water above its roof.
        const CAR_ROOF = 1.5 // metres from the car's floor to its roof
        let surfaceY = -Infinity
        for (const w of waterLevels) {
          if (w.level > surfaceY && pointInPolygon(car.x, car.z, w.ring)) surfaceY = w.level
        }
        bubbles.update(dt, surfaceY > car.y + CAR_ROOF, car, surfaceY)
        if (night > 0) {
          const hx = Math.cos(car.heading), hz = Math.sin(car.heading)
          headlight.position.set(car.x + hx * 2, car.y + 1.3, car.z + hz * 2)
          headlight.target.position.set(car.x + hx * 24, car.y, car.z + hz * 24)
          headlight.target.updateMatrixWorld()
        }
        // pull the camera in through tunnels, and when a building blocks the car
        camBlocked = viewBlocked(car.x, car.z, car.y + 1.5, stage.camera.position, camBlocked)
        const blocked = camBlocked
        const target = inTunnel(car.x, car.z) ? 0.42 : blocked ? 0.45 : 1
        // snap in quickly when blocked, ease back out gently once clear
        stage.camDistScale += (target - stage.camDistScale) * (1 - Math.exp(-(blocked ? 9 : 4) * dt))
        // bikes bank into corners; everything else stays upright
        const leanTarget = LEANS[vehicle] ? input.steer * Math.min(1, Math.abs(fwd) / 12) * MAX_LEAN : 0
        lean += (leanTarget - lean) * (1 - Math.exp(-6 * dt))
        // Wheels wind on toward the lock rather than snapping to it, so the
        // angle reflects how long you've held the turn.
        steerVis += (input.steer - steerVis) * (1 - Math.exp(-STEER_EASE * dt))
        // Flying? Hold the body level instead of tilting it to the terrain that's
        // skimming by underneath — at speed that ground normal changes every frame,
        // and the car twitched in all directions in the air. On the ground (car.y ≈
        // terrain) it still pitches to the slope as before.
        const airborne = car.y > provider.heightAt(car.x, car.z) + 1.5
        syncCamera(stage, car, dt, provider, lean, !!HOVERS[vehicle] || onDeck || airborne, steerVis)
        // sky dome: gradient + sun disc following the cycle (hidden in neon, which paints its own flat bg)
        const skyOn = theme.current !== 'neon'
        sky.setVisible(skyOn)
        if (skyOn) {
          const s = sampleDayNight(timeOfDay)
          const sunVis = Math.max(0, Math.min(1, (sunElevation(timeOfDay) + 0.05) / 0.17))
          sunDir.copy(sunScratch).normalize()
          sky.update(stage.camera.position, s.sky, s.sun, sunDir, sunVis, night)
        }
        if (autoWeather) {
          autoWeatherTimer += dt
          if (autoWeatherTimer > AUTO_WEATHER_PERIOD) {
            autoWeatherTimer = 0
            autoWeatherIdx = (autoWeatherIdx + 1) % WEATHERS.length
            showWeather(WEATHERS[autoWeatherIdx])
          }
        }
        weather.update(stage.camera.position, dt)
        fireworks.update(dt)
        clouds.update(stage.camera.position, dt, car.y) // clouds ride above the land, not above sea level
        minimap.update(
          car,
          taxi.enabled() ? taxi.target() : trial.nextGate(),
          taxi.enabled() ? (taxi.state().phase === 'toPickup' ? '#39e07a' : '#ffb020') : undefined,
        )
        roadLabels.update(stage.camera, car.x, car.z)
        stage.renderer.render(stage.scene, stage.camera)
      })
    }
  } catch (e) {
    const key = e instanceof Error && e.message === 'city not found' ? 'error.cityNotFound' : 'error.loadFailed'
    loading.error(t(key))
    // Don't leave the failure notice — and, on a menu-driven load, the loading
    // screen — hanging forever: clear it after 5s and bring the start menu back
    // so another city can be tried.
    errorDismiss = setTimeout(() => {
      loading.hide()
      if (!currentCity) {
        startMenu.show() // nothing ever loaded — offer the (fixed-layout) menu to try again
        return
      }
      // We still have the map we were driving. A failed switch must NOT yank the
      // full menu over it — if a Play/Random/search pick failed, just drop into
      // the map we were already on; an in-game city change leaves the menu hidden
      // and this is a no-op, so we keep driving.
      if (playAfterLoad !== null) {
        const mode = playAfterLoad
        playAfterLoad = null
        startMenu.hide()
        replayControls.setVisible(true)
        enterPlay(mode)
      }
    }, 5000)
  } finally {
    loading_ = false
    if (queued !== null) {
      const next = queued
      queued = null
      void loadCity(next)
    }
  }
}

/**
 * Turn the time trial on or off, gates, HUD, rivals and all.
 *
 * Shared because the race switch pulls the trial on with it: racing round gates
 * needs gates, and there is exactly one way to lay them out.
 */
function applyTrial(on: boolean): void {
  if (on) applyTaxi(false) // taxi and the trial/race are mutually exclusive
  setTrial(on)
  trial.setEnabled(on)
  trialHud.setVisible(on)
  if (on && car) trial.reset(lastRoads, provider, car)
  rivals.setEnabled(on && getRace())
  if (on && car && getRace()) rivals.reset(lastRoads, grid, provider, car, trial.course())
}

/** Taxi mode on/off — a chained pick-up/deliver shift, exclusive with the trial. */
function applyTaxi(on: boolean): void {
  taxi.setEnabled(on)
  taxiHud.setVisible(on)
  if (on) {
    applyTrial(false)
    if (car) taxi.reset(lastRoads, provider, car)
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
    nitro: getNitro(),
    demo: getDemo(),
    trial: getTrial(),
    race: getRace(),
    quality: getQuality(),
    density,
    units: getUnits(),
    weather: getWeather(),
    timeMode,
    zoom: getZoom(),
  },
  {
    onLoadCity: (q) => void loadCity(q),
    onSetDefaultCity: (q) => setDefaultCity(q),
    onShareCity: () => void navigator.clipboard?.writeText(location.href),
    onSetView: (mode) => theme.set(mode),
    onSelectVehicle: (type) => {
      vehicle = type
      audio.setVehicle(type)
      showVehicle(type)
      if (car) {
        car.vx = 0 // reset momentum for the new handling
        car.vz = 0
      }
    },
    onAudioChange: (patch) => audio.setState(patch),
    onCustomMusic: (file) => {
      audio.resume() // the picker click is a user gesture — safe to start audio
      audio.setCustomMusic(file)
    },
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
      applyQuality(stage, getQuality(), on) // low quality keeps shadows off regardless
    },
    onClouds: (on) => {
      setClouds(on)
      clouds.setEnabled(on)
    },
    onRoadDetail: (on) => {
      setRoadDetail(on)
      if (roadDetailMesh) roadDetailMesh.visible = on
    },
    onDensity: (d) => {
      density = d
      setDensity(d)
      // Rebuild the populations at the new size. They're laid out at creation, so
      // there is nothing to resize in place — and a city reload would be a far
      // heavier way to do it.
      if (!car) return
      trains?.dispose()
      trains = createTrains(stage.scene, lastRailways, provider, Math.random, countFor(density, 5), lastRoads)
      traffic?.dispose()
      traffic = createTraffic(stage.scene, lastRoads, provider, Math.random, crowdFor(density, 16))
      people?.dispose()
      people = createPedestrians(stage.scene, lastRoads, provider, Math.random, crowdFor(density, 22), lastWater, lastLat)
      boats?.dispose()
      boats = createBoats(stage.scene, lastWater, provider, Math.random, countFor(density, 4))
      birds.dispose()
      birds = makeBirds()
    },
    onTrial: (on) => applyTrial(on),
    onRace: (on) => {
      setRace(on)
      // There is nothing to race without gates, so switching the race on brings
      // the trial with it — course, HUD and all — rather than leaving you
      // wondering why three cars appeared and nothing else did.
      if (on && !trial.enabled()) {
        applyTrial(true)
        menu.setTrial(true) // or its checkbox sits there unticked over a running trial
      } else {
        rivals.setEnabled(on && trial.enabled())
        if (on && car && trial.enabled()) rivals.reset(lastRoads, grid, provider, car, trial.course())
      }
    },
    onDemo: (on) => {
      setDemo(on)
      autopilot.setEnabled(on)
      if (on && car) autopilot.reset(lastRoads, car)
    },
    onNitro: (on) => {
      setNitro(on)
      nitro.setEnabled(on)
      if (!on) {
        boostTimer = 0
        boost = 0
      }
    },
    onUnits: (u) => {
      setUnits(u)
      hud.setUnits(u)
    },
    onQuality: (q) => {
      setQuality(q)
      // Resolution scale + shadows apply live; antialias and particle counts
      // are fixed at construction and pick the new tier up on the next load.
      applyQuality(stage, q, getShadows())
    },
    onWeather: (w) => {
      setWeather(w)
      applyWeatherSetting(w)
    },
    onTimeMode: (m) => {
      timeMode = m
      setTimeMode(m)
      // Locking to day or night jumps the sky there at once; cycle picks up from here.
      if (m === 'day') timeOfDay = DAY_TIME
      else if (m === 'night') timeOfDay = NIGHT_TIME
    },
    onZoom: (v) => {
      stage.camDist = clampCamDist(v)
      setZoom(stage.camDist)
    },
    onResetLocation: () => {
      // Put the car back on the start line. Not a reload: resetting where you are
      // has nothing to do with which city you're in, and reloading threw away the
      // city as well and took a fresh download to get back.
      clearSession()
      if (!car) return
      car.x = 0
      car.z = 0
      car.heading = 0
      car.vx = 0
      car.vz = 0
      car.vy = 0
      car.y = provider.heightAt(0, 0) + (HOVERS[vehicle] ? HOVER_H : 0)
      boostTimer = 0
      boost = 0
      // Everything that was arranged around the old spot follows the car back.
      const spots = lastRoads
        .filter((r) => !r.bridge && !r.tunnel)
        .flatMap((r) => r.points)
        .filter((p) => Math.abs(p.x) <= RADIUS && Math.abs(p.z) <= RADIUS) // keep pickups on the map
      nitro.setSpots(spots, provider, car.x, car.z)
      cans.setSpots(spots, provider, car.x, car.z)
      autopilot.reset(lastRoads, car)
      if (trial.enabled()) {
        trial.reset(lastRoads, provider, car)
        rivals.reset(lastRoads, grid, provider, car, trial.course()) // back on the start line with you
      }
    },
    onReset: () => {
      resetSettings()
      location.reload()
    },
  },
)
theme.onChange = (mode) => menu.setViewMode(mode)

/**
 * Whether a building stands between the car and the camera. Walks the sight line
 * and tests nearby footprints against the ray's height — far cheaper than
 * raycasting the merged city mesh every frame.
 */
function viewBlocked(cx: number, cz: number, cy: number, cam: THREE.Vector3, wasBlocked: boolean): boolean {
  const dx = cam.x - cx, dz = cam.z - cz, dy = cam.y - cy
  const len = Math.hypot(dx, dz)
  if (len < 1) return false
  // Hysteresis: it takes CAM_GRAZE metres under a roof to call the view blocked,
  // and CAM_GRAZE over it to call it clear again. On a bridge the car rides at
  // roof height, so the sight line grazes the rooftops and a bare comparison
  // flips every frame — the camera then snaps in and eases out over and over,
  // and that was the shake. The car was never moving.
  const margin = wasBlocked ? -CAM_GRAZE : CAM_GRAZE
  const steps = Math.min(14, Math.max(3, Math.ceil(len / 2)))
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const x = cx + dx * t, z = cz + dz * t, y = cy + dy * t
    for (const fp of occGrid.near(x, z)) {
      const roof = provider.heightAt(x, z) + (occHeight.get(fp) ?? 0)
      if (y + margin < roof && pointInPolygon(x, z, fp)) return true
    }
  }
  return false
}

/** Whether (x,z) is on a tunnel segment (car is under a roof). */
function inTunnel(x: number, z: number): boolean {
  for (const s of tunnelSegs) {
    const dx = s.bx - s.ax, dz = s.bz - s.az
    const l2 = dx * dx + dz * dz
    let t = l2 > 0 ? ((x - s.ax) * dx + (z - s.az) * dz) / l2 : 0
    t = Math.max(0, Math.min(1, t))
    const ex = x - (s.ax + t * dx), ez = z - (s.az + t * dz)
    if (ex * ex + ez * ez < s.r2) return true
  }
  return false
}

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
// --- start screen: a live city drives itself behind the menu while you pick ---
function selectVehicle(type: VehicleType): void {
  vehicle = type
  audio.setVehicle(type)
  showVehicle(type)
  if (car) {
    car.vx = 0
    car.vz = 0
  }
}
/**
 * Drop out of the attract backdrop and start a driving session in `mode`. The
 * car and roads must already exist (the city is loaded): this runs either off the
 * Play button (playing the current backdrop) or at the tail of a load kicked off
 * by Random / city-search — see `playAfterLoad`.
 */
function enterPlay(mode: StartMode): void {
  attract = false
  if (mode === 'race') {
    setRace(true)
    applyTrial(true)
  } else if (mode === 'trial') {
    setRace(false)
    applyTrial(true)
  } else if (mode === 'taxi') {
    setRace(false)
    applyTaxi(true)
  } else {
    setRace(false)
    applyTrial(false)
    applyTaxi(false)
  }
  autopilot.setEnabled(getDemo()) // restore the demo setting (off by default → you drive)
  if (getDemo() && car) autopilot.reset(lastRoads, car)
}
function startPlay(mode: StartMode): void {
  startMenu.hide()
  replayControls.setVisible(true) // record / replay your drive, in-game
  audio.resume() // the Play click is a user gesture — safe to start audio
  enterPlay(mode) // the backdrop is already loaded — play what you're watching
}
/**
 * Load `query` and play it: hide the menu now, and once the city lands, enter the
 * mode picked on the start screen. Backs the Random button and the city search —
 * which used to only swap the backdrop and leave the menu (and the demo) up, so a
 * click during the opening backdrop load did nothing at all.
 */
function playCity(query: string): void {
  startMenu.enterLoading() // keep the animated backdrop up as a loading screen
  replayControls.setVisible(true)
  audio.resume() // user gesture — safe to start audio
  playAfterLoad = startMode
  void loadCity(query)
}
function startContinue(): void {
  const sess = getSession()
  if (!sess) return
  attract = false
  startMenu.enterLoading() // backdrop stays up as a loading screen while the city comes in
  replayControls.setVisible(true)
  audio.resume()
  autopilot.setEnabled(getDemo())
  void loadCity(sess.city) // loadCity resumes the saved pose when the city matches
}

// A ?city= link names the backdrop (and pre-fills the search); otherwise a random
// city drives itself behind the menu. Play hands you whatever you're watching.
const linkCity = new URL(location.href).searchParams.get('city') || ''
const startMenu = createStartMenu(
  ui,
  {
    onPlay: startPlay,
    onContinue: startContinue,
    onCity: playCity,
    onRandom: () => playCity(pickRandomCity()),
    onVehicle: selectVehicle,
    onMode: (m) => {
      startMode = m
    },
  },
  { vehicle, city: linkCity, hasSession: !!getSession() },
)
void loadCity(linkCity || pickRandomCity())

// persist the session (city + car pose) so a reload resumes in place
const saveSession = (): void => {
  if (car && currentCity) setSession({ city: currentCity, x: car.x, z: car.z, heading: car.heading, dist: odometer })
}
setInterval(saveSession, 3000)
window.addEventListener('beforeunload', saveSession)

// Poll the deployed version.json; offer a reload once a newer build is live.
const updateNotice = createUpdateNotice(ui)
// A minute, not five. The bar can only appear in the window between a deploy and
// your next reload, and on a five-minute timer that window is usually shut
// before it ever fires.
const UPDATE_POLL_MS = 60 * 1000
async function checkForUpdate(): Promise<void> {
  try {
    const url = new URL('version.json', location.href)
    url.searchParams.set('t', String(Date.now())) // bypass any cache
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return
    const { version } = (await res.json()) as { version?: string }
    if (version && version !== __APP_VERSION__) updateNotice.show(version)
  } catch {
    /* offline or not deployed yet — ignore */
  }
}
setInterval(() => void checkForUpdate(), UPDATE_POLL_MS)
// And the moment you come back to the tab: browsers throttle timers in
// background tabs, so returning to a tab left open all day would otherwise sit
// there saying nothing.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) void checkForUpdate()
})
window.addEventListener('focus', () => void checkForUpdate())
void checkForUpdate()
