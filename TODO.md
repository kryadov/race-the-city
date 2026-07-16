# TODO / Ideas

Backlog of ideas for Race the City. Shipped features live in the git tags / releases
(v0.1.0 … current); this file tracks what's next.

## 🗺 World & map
- [x] Sea / coastline (approximate flat-plane sea for coastal areas) — done in v0.14.0
- [x] Parks, greenery, trees (`leisure=park`, `natural=wood`, `landuse=grass`) — done in v0.13.0
- [ ] **Palms in southern cities, not firs** — tree shape should follow latitude (the projector
      knows the centre lat); conifers in Monaco read as wrong
- [ ] **Big rivers are missing entirely** — `overpassQuery` asks only for `way[...]`, never
      `relation[...]`, so any water mapped as a multipolygon relation (most large rivers — the
      Neva, the Moskva) never arrives. Needs relation members + outer-ring stitching by node id,
      and care: `>;` on a river relation can drag in the whole waterway far past the bbox.
- [ ] Pedestrian zones, squares, parking (`highway=pedestrian`, `amenity=parking`)
- [x] Railways, bridges, tunnels — done in v0.15.0 (bridges are decorative raised decks; you still drive on terrain)
- [ ] **Drivable bridges** — deck as a real surface: parse `layer`, span flat between abutments
      instead of following terrain, add pillars/railings/ramps. Blocked on `ElevationProvider.heightAt`
      being single-valued (one Y per X,Z) — needs a deck-aware surface query. Bridge lane markings,
      labels and nitro spots currently render on the terrain *under* the deck (`main.ts` passes
      unfiltered roads to `buildRoadDetail`).
      - [ ] **Name the rivers** while doing this — `roadLabels` only labels roads today, and a
            bridge is worth crossing when you can see what it crosses. Ship with the bridges.
- [ ] **Manhole covers** on the roads — `man_made=manhole` exists in OSM but is mapped patchily;
      scattering them along road centrelines (like the nitro spots) will read better than the data
- [ ] Roof shapes / colour buildings by type; better height heuristics
- [ ] Larger area / stream neighbouring tiles as you drive
- [ ] POI markers (cafés, fuel) from OSM
- [x] Sky dome with gradient + sun disc — done in v0.33.0
- [x] Street lamps, signs & road markings — done in v0.31.0, reworked in v0.37.0

## 🚗 Vehicles & physics
- [x] More vehicles — six more incl. a leaning motorbike — done in v0.51.0 (custom colours still open)
- [x] **Ten more vehicles** — crane, minivan, tracked ATV, hovercar, EV, retro, tanker, tiller,
      roller, combine — done in v0.58.0 (19 types total)
- [x] **Grouped, collapsible vehicle picker** (4 groups by purpose) — done in v0.58.0
- [ ] **Nitro: flame from the exhaust** while the boost is active
- [ ] **`lens(mat, w, h, …)` and `housingBar(h, w, …)` take their args in opposite orders** —
      that trap produced two 1.5m-tall "light bars" in v0.58.0 that the whole suite passed.
      Give them a shared arg order (or named args) before the next vehicle is added.
- [x] **Steered wheels turn with the input** — tagged per vehicle, since a combine steers on its
      rear and a tracked hull on neither — done in v0.62.0
- [x] **Tiller pulls a trailer** and the driver rides it — done in v0.62.0
- [ ] Custom vehicle colours
- [ ] **Jumps** — carry speed off a crest and fly. `CarState` has no `vy` and no gravity today:
      `stepCar` teleports Y onto the terrain every frame, so ramps do nothing.
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
- [ ] **Planes crossing the sky** — occasional, high up, with a contrail
- [ ] **Trains on the rails** — freight, intercity and commuter EMUs, running the OSM railway
      polylines we already parse (`world.railways`, drawn as bare ribbons since v0.15.0)

## 🎨 Visuals & atmosphere
- [x] Weather (rain/snow/fog, menu option) — done in v0.26.0, auto-cycling in v0.42.0, snow tweak v0.45.1
- [x] Street lights at night — lamps, fixtures & light pools — done in v0.31.0, reworked v0.37.0
- [ ] Glowing building windows at night
- [x] Shadows (sun shadow map, car-following frustum, menu toggle) — done in v0.23.0
- [x] Sky dome with gradient + sun disc — done in v0.33.0
- [x] **Stars at night** — hashed from the view direction in the sky shader, no new
      objects or draw calls — done in v0.60.0
- [x] Clouds + menu toggle — done in v0.27.0
- [ ] Bloom / post-processing for neon mode
- [ ] Water reflections, ripple animation
- [ ] Rounder low-poly buildings, more colour variety
- [x] Buildings read as separate volumes — done in v0.55.0

## 🔊 Audio
- [x] Custom music file upload — use your own audio file as looping music — done in v0.49.0
- [x] **Real music tracks instead of the procedural loops** — six mp3s in `public/audio/`,
      random on startup, another at random when one ends; music on by default — done in v0.59.0
- [x] **Fade the engine out after ~10s stationary**, back on the throttle — done in v0.61.0
- [x] **Per-vehicle engine sound** — diesel / petrol / race / small / electric / turbine
      profiles — done in v0.61.0
- [ ] Horn / indicator sounds, checkpoint chime
- [ ] Positional audio (engine quieter as camera pulls back)

## 🖥 UI / UX
- [ ] Full-screen map on a key; minimap zoom
- [x] **Pause button next to the ⚙ button** (Escape too) — done in v0.63.0
- [ ] Controls help overlay
- [x] Shareable link with the city in the URL (`?city=…`) — done in v0.41.0
- [x] Save position / session (city + car pose) — done in v0.48.0
- [x] Camera zoom slider — done in v0.39.0; auto pull-in near buildings v0.53.0, in tunnels v0.47.0
- [x] Random-city button — done in v0.43.0
- [x] Collapsible menu groups + reset-location button — done in v0.57.0
- [x] Notify when a new version is deployed — done in v0.50.0
- [ ] **Update notice: make dismiss stick** — `updateNotice.ts:9` claims "never shown twice for
      the same version" and `show(version: string)` takes the version, but the implementation
      ignores it and never dedupes. `main.ts:579` re-polls every 5 min, so ✕ only hides the bar
      until the next poll and it pops back. Remember the dismissed version.

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
