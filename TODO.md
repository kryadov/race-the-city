# TODO / Ideas

Backlog of ideas for Race the City. Shipped features live in the git tags / releases
(v0.1.0 … current); this file tracks what's next.

## 🗺 World & map
- [x] Sea / coastline (approximate flat-plane sea for coastal areas) — done in v0.14.0
- [x] Parks, greenery, trees (`leisure=park`, `natural=wood`, `landuse=grass`) — done in v0.13.0
- [ ] Pedestrian zones, squares, parking (`highway=pedestrian`, `amenity=parking`)
- [x] Railways, bridges, tunnels — done in v0.15.0 (bridges are decorative raised decks; you still drive on terrain)
- [ ] **Drivable bridges** — deck as a real surface: parse `layer`, span flat between abutments
      instead of following terrain, add pillars/railings/ramps. Blocked on `ElevationProvider.heightAt`
      being single-valued (one Y per X,Z) — needs a deck-aware surface query. Bridge lane markings,
      labels and nitro spots currently render on the terrain *under* the deck (`main.ts` passes
      unfiltered roads to `buildRoadDetail`).
- [ ] Roof shapes / colour buildings by type; better height heuristics
- [ ] Larger area / stream neighbouring tiles as you drive
- [ ] POI markers (cafés, fuel) from OSM
- [x] Sky dome with gradient + sun disc — done in v0.33.0
- [x] Street lamps, signs & road markings — done in v0.31.0, reworked in v0.37.0

## 🚗 Vehicles & physics
- [x] More vehicles — six more incl. a leaning motorbike — done in v0.51.0 (custom colours still open)
- [ ] **Ten more vehicles** (requested; shipped set is car, sports, racecar, truck, lorry, bus,
      motorbike, tractor, cabrio):
  - [ ] Mobile crane (авто-кран)
  - [ ] Minivan (минивэн)
  - [ ] Tracked all-terrain vehicle (гусеничный вездеход) — tracks, not wheels
  - [ ] Hovercraft / wheel-less aero car (аэро-мобиль) — floats, no wheels
  - [ ] Electric car (электромобиль)
  - [ ] Retro car (ретро)
  - [ ] Tanker truck (цистерна)
  - [ ] Walk-behind tractor (мотоблок)
  - [ ] Road roller (каток)
  - [ ] Combine harvester (комбайн)
- [ ] **Group the vehicle picker into collapsible categories** — 19 types is too many for one
      flat list; reuse the collapsible groups from v0.57.0
- [ ] Custom vehicle colours
- [ ] Brake tuning — low-speed brake can overshoot into reverse (same class as the fixed friction bug)
- [x] Drift effects — tyre skid marks + smoke — done in v0.16.0 (2x longer trail in v0.38.0)
- [ ] Damage / dents, collision bounce with impulse
- [x] Headlights (glow + spotlight that brightens at night) — done in v0.19.0
- [x] Speedometer / HUD (km/h) — done in v0.20.0, gauge in v0.25.0, odometer + km/miles in v0.56.0
- [x] Turn signals + per-vehicle tail lights — done in v0.32.0, fender repeaters in v0.40.0
- [x] Visible glass on enclosed vehicles — done in v0.54.0

## 🏁 Gameplay modes
- [ ] Time trial — checkpoints, timer, best time (localStorage)
- [x] Free objectives — nitro speed-boost pickups scattered on roads — done in v0.45.0
      (drive-to-a-point / coins still open)
- [ ] Traffic — simple AI cars on roads
- [ ] Pedestrians (ambience)

## 🎨 Visuals & atmosphere
- [x] Weather (rain/snow/fog, menu option) — done in v0.26.0, auto-cycling in v0.42.0, snow tweak v0.45.1
- [x] Street lights at night — lamps, fixtures & light pools — done in v0.31.0, reworked v0.37.0
- [ ] Glowing building windows at night
- [x] Shadows (sun shadow map, car-following frustum, menu toggle) — done in v0.23.0
- [x] Sky dome with gradient + sun disc — done in v0.33.0
- [x] Clouds + menu toggle — done in v0.27.0
- [ ] Bloom / post-processing for neon mode
- [ ] Water reflections, ripple animation
- [ ] Rounder low-poly buildings, more colour variety
- [x] Buildings read as separate volumes — done in v0.55.0

## 🔊 Audio
- [x] Custom music file upload — use your own audio file as looping music — done in v0.49.0
- [ ] **Real music tracks instead of the procedural loops** — ship mp3s in `public/audio/`,
      pick one at random on startup (today `TRACKS` in `src/audio/audio.ts` is three
      oscillator loops: Cruise / Chill / Upbeat)
- [ ] **Fade the engine out after ~10s stationary** — idle engine drone is tiring when parked;
      bring it back on throttle
- [ ] Horn / indicator sounds, checkpoint chime
- [ ] Positional audio (engine quieter as camera pulls back)

## 🖥 UI / UX
- [ ] Full-screen map on a key; minimap zoom
- [ ] Pause menu; controls help overlay
- [x] Shareable link with the city in the URL (`?city=…`) — done in v0.41.0
- [x] Save position / session (city + car pose) — done in v0.48.0
- [x] Camera zoom slider — done in v0.39.0; auto pull-in near buildings v0.53.0, in tunnels v0.47.0
- [x] Random-city button — done in v0.43.0
- [x] Collapsible menu groups + reset-location button — done in v0.57.0
- [x] Notify when a new version is deployed — done in v0.50.0

## ⚙️ Data & performance
- [ ] Overpass caching proxy (if we hit rate limits — designed for)
- [ ] Instancing for buildings (perf on large cities)
- [ ] Web Worker for parsing / mesh building (no frame hitch on load)
- [x] Loading progress bar with percentages — done in v0.44.0
- [x] Low/normal/high rendering modes — done in v0.52.0
- [x] Shader/GPU warm-up during load (kills startup stutter) — done in v0.46.0
- [x] Retry flaky city loads up to 3 times — done in v0.56.1

## 🧹 Tech debt / polish
- [x] Update Actions node (22) — v0.25.0
- [x] Split the bundle (three vendor chunk) — v0.25.0
- [ ] E2E test of a real city load (currently unit tests + headless smoke without network)
- [x] Early-review nits (parse naming, cache db.close) — v0.25.0
