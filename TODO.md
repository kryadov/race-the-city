# TODO / Ideas

Backlog of ideas for Race the City. Shipped features live in the git tags / releases
(v0.1.0 … current); this file tracks what's next.

## 🗺 World & map
- [x] Sea / coastline (approximate flat-plane sea for coastal areas) — done in v0.14.0
- [x] Parks, greenery, trees (`leisure=park`, `natural=wood`, `landuse=grass`) — done in v0.13.0
- [ ] Pedestrian zones, squares, parking (`highway=pedestrian`, `amenity=parking`)
- [x] Railways, bridges, tunnels — done in v0.15.0 (bridges are decorative raised decks; you still drive on terrain)
- [ ] Roof shapes / colour buildings by type; better height heuristics
- [ ] Larger area / stream neighbouring tiles as you drive
- [ ] POI markers (cafés, fuel) from OSM

## 🚗 Vehicles & physics
- [ ] More vehicles (motorbike, bus, race car); custom colours
- [ ] Brake tuning — low-speed brake can overshoot into reverse (same class as the fixed friction bug)
- [x] Drift effects — tyre skid marks + smoke — done in v0.16.0
- [ ] Damage / dents, collision bounce with impulse
- [x] Headlights (glow + spotlight that brightens at night) — done in v0.19.0
- [ ] Speedometer / HUD (km/h)

## 🏁 Gameplay modes
- [ ] Time trial — checkpoints, timer, best time (localStorage)
- [ ] Free objectives — drive to a point, collect coins
- [ ] Traffic — simple AI cars on roads
- [ ] Pedestrians (ambience)

## 🎨 Visuals & atmosphere
- [ ] Weather — rain / snow / fog (tie into day/night)
- [ ] Glowing windows / street lights at night
- [x] Shadows (sun shadow map, car-following frustum, menu toggle) — done in v0.23.0
- [ ] Bloom / post-processing for neon mode
- [ ] Water reflections, ripple animation
- [ ] Rounder low-poly buildings, more colour variety

## 🔊 Audio
- [ ] Custom music file upload (mp3/ogg)
- [ ] Horn / indicator sounds, checkpoint chime
- [ ] Positional audio (engine quieter as camera pulls back)

## 🖥 UI / UX
- [ ] Full-screen map on a key; minimap zoom
- [ ] Pause menu; controls help overlay
- [ ] Shareable link with the city in the URL (`?city=…`)
- [ ] Save position / session

## ⚙️ Data & performance
- [ ] Overpass caching proxy (if we hit rate limits — designed for)
- [ ] Instancing for buildings (perf on large cities)
- [ ] Web Worker for parsing / mesh building (no frame hitch on load)
- [ ] Loading progress bar with percentages

## 🧹 Tech debt / polish
- [x] Update Actions node (22) — v0.25.0
- [x] Split the bundle (three vendor chunk) — v0.25.0
- [ ] E2E test of a real city load (currently unit tests + headless smoke without network)
- [x] Early-review nits (parse naming, cache db.close) — v0.25.0
