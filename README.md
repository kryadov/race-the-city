# Race the City 🚗🌆

Drive a car around a **real city**, built on the fly from open data.
Type a city name and you're behind the wheel of a low-poly version of its
streets, buildings, and terrain. Everything runs right in the browser — no backend.

- **Roads, buildings, bridges, railways, water, parks and street furniture** — from
  [OpenStreetMap](https://www.openstreetmap.org) (Overpass API)
- **Ground elevation** — from [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (Terrarium format)
- **3D and rendering** — [Three.js](https://threejs.org)

Drive it however you like: free-roam and rediscover your neighbourhood, run the gates
against the clock, race three rivals round them, or hand it to the autopilot and watch.
The city is inhabited while you do — traffic, people, trams and trains, ships, aircraft,
balloons, livestock in the fields — and it has weather and a day/night cycle to do it in.

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
view mode, vehicle, and audio. Click **Go** and you can drive within a few seconds.

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the built version locally |
| `npm test` | Unit tests (Vitest), single run |
| `npm run test:watch` | Tests in watch mode |
| `npm run boot-check` | Loads the built app in headless Chrome and fails if it doesn't start |

## Controls

| Keys | Action |
|---|---|
| `W` / `↑` | Accelerate |
| `S` / `↓` | Reverse / brake |
| `A` / `←`, `D` / `→` | Steer |
| `Space` | Brake |
| `H` | Horn |
| `Esc` | Pause |
| `?` | The controls, on a card |
| `+` / `-` | Zoom camera in / out |
| `V` | Toggle view: day ↔ neon wireframe |

The camera follows the car from behind. You can't drive through buildings — the car
slides along walls. Press `V` (or the view button in the UI) to switch between the lit
"day" look and a glowing neon-wireframe look.

On phones and tablets, on-screen buttons appear automatically — steering on the left,
throttle and reverse on the right.

Pick a vehicle in the **⚙ settings menu**: nineteen of them, grouped by what they are for —
road cars from the nimble hatchback to the eager sports car, trucks and a bus, working
machines (tractor, crane, roller, combine, two-wheel tractor with its trailer), and the odd
ones out (a motorbike that leans, a tracked all-terrain, a wheel-less hovercar). Each
handles like what it is. Hard cornering at speed breaks the tail loose into a controllable
drift, and the wheels that steer, steer.

Blue bottles of nitrous are scattered on the roads: drive over one for a short, violent
turn of speed and a flame out of the exhaust. Red cans are petrol — the tank is good for a
few minutes of full throttle, and running it down takes the legs off the car rather than
stopping it dead.

A rotating minimap in the bottom-left corner shows nearby roads and buildings; the car
marker always points up. Turn on street-name labels in the ⚙ menu. The sky runs through a
day/night cycle — scrub the time of day with the slider — and has weather to go with it:
rain, snow, fog, and clouds that thicken when it turns.

### Modes

All in the ⚙ menu:

- **Time trial** — six gates on real streets, a lap clock, and a best lap that survives a
  reload. The minimap points at the next gate.
- **Race** — the same gates with three AI rivals on the start line beside you. They drive
  the same physics you do, navigating by road; the HUD says what place you are in. Finish a
  lap and the sky goes up.
- **Demo** — the autopilot drives the city by itself, braking for traffic and trains.
- **Density** — how busy the streets are, from empty to swarming.

## Entering a city

Open the ⚙ menu and type into the city field. "Set as default" remembers it for next launch.

- A plain name: `Amsterdam`, `Тбилиси`, `Porto`.
- If the name is ambiguous, add the country: `Poti, Georgia` (otherwise the Nominatim
  geocoder may pick a same-named place in another country).
- You can enter coordinates directly: `41.79,44.79` (latitude, longitude).

A ~1 km radius patch around the chosen point is loaded. Reloading the same city is instant —
it's served from the browser cache (IndexedDB), which is keyed by both the area AND what was
asked for, so a city cached before the game learned about railways doesn't go on pretending
it hasn't got any.

## How it works

The pipeline from input to driving:

```
city → geocode (Nominatim) → ~1 km bbox
     → OSM (Overpass: roads, buildings, water, rail, parks…)  ─┐
     → terrain (Terrain Tiles → heights)                      ─┼→ build meshes on one
                                                               │  shared coordinate frame
     → car spawns on the nearest road → drive                 ─┘
```

If the terrain tiles fail to load, it falls back gracefully to flat ground — the game keeps
running. If Overpass is having a bad day, the load is retried before it gives up.

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

## What's next

`TODO.md` is the live list — what has shipped, what is asked for, and what was tried and
ruled out (with the measurement that ruled it out).
