# Race the City 🚗🌆

Drive a car around a **real city**, built on the fly from open data.
Type a city name and you're behind the wheel of a low-poly version of its
streets, buildings, and terrain. Everything runs right in the browser — no backend.

- **Roads and buildings** — from [OpenStreetMap](https://www.openstreetmap.org) (Overpass API)
- **Ground elevation** — from [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (Terrarium format)
- **3D and rendering** — [Three.js](https://threejs.org)

Free-roam cruising: no timers, no opponents — just drive and rediscover your neighbourhood.

**▶ Play it live: https://kryadov.github.io/race-the-city/**

---

## Quick start

Requires Node.js 18+ (tested on 22).

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). The default city loads
automatically; open the **⚙ settings menu** (top-right) to change the city, language,
view mode, and vehicle. Click **Go** and you can drive within a few seconds.

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the built version locally |
| `npm test` | Unit tests (Vitest), single run |
| `npm run test:watch` | Tests in watch mode |

## Controls

| Keys | Action |
|---|---|
| `W` / `↑` | Accelerate |
| `S` / `↓` | Reverse / brake |
| `A` / `←`, `D` / `→` | Steer |
| `Space` | Brake |
| `+` / `-` | Zoom camera in / out |
| `V` | Toggle view: day ↔ neon wireframe |

The camera follows the car from behind. You can't drive through buildings — the car
slides along walls. Press `V` (or the view button in the UI) to switch between the lit
"day" look and a glowing neon-wireframe look.

Pick a vehicle in the **⚙ settings menu** — 🚗 car (nimble, grippy), 🚚 truck (heavy,
sluggish, slides more), 🏎 sports (fast, eager). Hard cornering at speed breaks the tail
loose into a controllable drift.

## Entering a city

Open the ⚙ menu and type into the city field. "Set as default" remembers it for next launch.

- A plain name: `Amsterdam`, `Тбилиси`, `Porto`.
- If the name is ambiguous, add the country: `Poti, Georgia` (otherwise the Nominatim
  geocoder may pick a same-named place in another country).
- You can enter coordinates directly: `41.79,44.79` (latitude, longitude).

A ~1 km radius patch around the chosen point is loaded. Reloading the same city is instant —
it's served from the browser cache (IndexedDB).

## How it works

The pipeline from input to driving:

```
city → geocode (Nominatim) → ~1 km bbox
     → OSM (Overpass: roads + buildings)   ─┐
     → terrain (Terrain Tiles → heights)   ─┼→ build meshes (ground / roads / buildings)
                                             │  on one shared coordinate frame
     → car spawns on the ground → drive    ─┘
```

If the terrain tiles fail to load, it falls back gracefully to flat ground — the game keeps running.

### Project structure

Layers with clear boundaries: the data layer knows nothing about Three.js, the world layer
knows nothing about the network.

```
src/
  geo/       lat/lon↔meter projection, OSM parsing, Overpass, geocoding, IndexedDB cache
  terrain/   ElevationProvider: Terrarium tile decoding + flat-ground fallback
  world/     meshes: ground (terrain), buildings (footprint extrusion), roads (ribbons)
  physics/   spatial grid + circle-vs-polygon collision with sliding
  vehicle/   arcade car physics + keyboard
  app/       scene, follow camera, game loop, view theme, pipeline wiring
  ui/        city input, loading overlay
test/        unit tests for pure functions (projection, parsing, elevation, grid, collision, car)
```

Detailed project docs (spec and implementation plan) live in `docs/superpowers/`.

## Tech

Vite · TypeScript (strict) · Three.js · Vitest. It's a static site — deploy it to any static
host (e.g. GitHub Pages; this repo ships a workflow that publishes to
<https://kryadov.github.io/race-the-city/> on every push to `main`).

### Versioning & releases

The app version (from `package.json`) is injected at build time and shown as a small badge
in the corner. Each feature bumps the version and ships as a GitHub Release: push a `vX.Y.Z`
tag and the release workflow cuts it with auto-generated notes.

## Data attribution

When you publish, respect the source licences:

- **OpenStreetMap** — data © OpenStreetMap contributors, licensed under
  [ODbL](https://www.openstreetmap.org/copyright).
- **Elevation (Terrain Tiles)** — data from the Mapzen / AWS Open Data project, see
  [sources and attribution](https://github.com/tilezen/joerd/blob/master/docs/attribution.md).
- **Nominatim / Overpass** — public services with a
  [usage policy](https://operations.osmfoundation.org/policies/nominatim/): keep request
  volume modest. For heavy use, run your own instance or add a caching proxy.

## Roadmap ideas

- Parks, water, and trees from OSM
- More vehicles and handling tuning
- Minimap, day/night cycle, engine sound
- A racing mode on top: checkpoints, timer, best lap

Smaller technical follow-ups: brake tuning, smoothing road seams at sharp turns,
framerate-independent camera smoothing.
