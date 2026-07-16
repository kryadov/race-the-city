# TODO / Ideas

Backlog of ideas for Race the City. Shipped features live in the git tags / releases
(v0.1.0 … current); this file tracks what's next.

## 🗺 World & map
- [ ] Sea / coastline rendering (`natural=coastline`, water relations — not simple ways yet)
- [~] Parks, greenery, trees (`leisure=park`, `natural=wood`, `landuse=grass`) — **in progress**
- [ ] Pedestrian zones, squares, parking (`highway=pedestrian`, `amenity=parking`)
- [ ] Railways, bridges, tunnels (`railway`, `bridge`/`tunnel` — raise bridges)
- [ ] Roof shapes / colour buildings by type; better height heuristics
- [ ] Larger area / stream neighbouring tiles as you drive
- [ ] POI markers (cafés, fuel) from OSM

## 🚗 Vehicles & physics
- [ ] More vehicles (motorbike, bus, race car); custom colours
- [ ] Brake tuning — low-speed brake can overshoot into reverse (same class as the fixed friction bug)
- [ ] Drift effects — tyre skid marks on the road, dust/smoke particles
- [ ] Damage / dents, collision bounce with impulse
- [ ] Headlights (esp. at night, tie into day/night), brake lights
- [ ] Speedometer / HUD (km/h)

## 🏁 Gameplay modes
- [ ] Time trial — checkpoints, timer, best time (localStorage)
- [ ] Free objectives — drive to a point, collect coins
- [ ] Traffic — simple AI cars on roads
- [ ] Pedestrians (ambience)

## 🎨 Visuals & atmosphere
- [ ] Weather — rain / snow / fog (tie into day/night)
- [ ] Glowing windows / street lights at night
- [ ] Shadows (directional shadow map)
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
- [ ] Update GitHub Actions versions (Node 20 deprecation warning)
- [ ] Split the bundle (~500 kB single chunk — Vite warning)
- [ ] E2E test of a real city load (currently unit tests + headless smoke without network)
- [ ] Minor early-review nits: naming in `parse`, `db.close()` in cache, etc.
