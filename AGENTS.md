# AGENTS.md

Guidance for AI agents and human contributors working in this repo.

## What this is

A static browser 3D game: free-roam driving around a real city built on the fly from
OpenStreetMap geometry over real elevation from AWS Terrain Tiles. Vite + TypeScript
(strict) + Three.js, tested with Vitest. **No backend** — every network call goes
directly from the browser.

## Commands

```bash
npm install          # once
npm run dev          # dev server (hot reload)
npm test             # unit tests, single run  — run before committing
npx tsc --noEmit     # type-check (strict)      — run before committing
npm run build        # production build to dist/
npm run preview      # serve the build locally
npm run boot-check   # after a build: does the app actually START? (headless Chrome)
```

Before committing any change, `npm test` and `npx tsc --noEmit` must both pass, and
`npm run build` must succeed and leave no stray files (`git status --short` clean).

If you touched `src/app/main.ts` or anything it imports at module scope, run
`npm run boot-check` too. Clean types, green tests and a clean build once shipped a black
screen: none of them load `main.ts` (see the temporal-dead-zone gotcha below).

## Architecture

Layers with one-way dependencies. The **data layer knows nothing about Three.js**, and
the **world layer knows nothing about the network**. Keep it that way.

```
src/
  geo/       lat/lon↔meter projection, OSM parse, Overpass, Nominatim geocode, IndexedDB cache
  terrain/   ElevationProvider interface; Terrarium tile decode; FlatProvider; slope (groundQuat)
  world/     mesh builders: ground, buildings, roads, bridges+decks, railways, water, greenery,
             props, parking, road detail (markings/lamps/signs), start pose, roadGraph, route (A*)
  physics/   SpatialGrid (footprints + their roof heights) + circle-vs-polygon collision
  vehicle/   arcade car step (pure), gravity/jumps, vehicle specs, models/ per family, fuel
  app/       scene/camera/loop, theme, weather, sky, day/night, clouds, traffic, pedestrians,
             trains, boats, aircraft, birds, livestock, nitro/cans (over a shared pickup
             engine), autopilot, rivals, timeTrial, fireworks, density, prefs, main.ts wiring
  ui/        settings menu, HUD, minimap, trial HUD, road labels, help, pause, update notice
test/        unit tests mirror src/ for pure functions
scripts/     boot-check.mjs — the built app in headless Chrome
```

Data flow: `geocode → bbox(1km) → Overpass (cache) → parseOsm → Projector → loadTerrarium
(→ FlatProvider on failure) → build ground/buildings/roads → SpatialGrid(footprints, tops) →
startPose(roads) → createCar → startLoop(stepCar + syncCamera + render)`. All wired in
`src/app/main.ts`.

## Conventions that MUST hold

- **One coordinate frame.** Ground plane is Three.js **XZ**, up is **+Y**. `Vec2 {x,z}`
  are local meters; projection maps `lon→x`, `lat→−z` (north is −z); elevation → `y`.
  Origin `(0,0)` is the geocoded center. A footprint/road/car at local `(x,z)` MUST render
  at world `(x, heightAt(x,z), z)` consistently across ground, buildings, roads, the
  collision grid, and the car. This is the highest-risk area — see the building gotcha below.
- **Elevation via `ElevationProvider.heightAt(x,z)`.** Every vertical consumer (ground,
  buildings, roads, car) calls the same provider, so they can't desync. Terrain load failure
  must fall back to `FlatProvider` and keep running.
- **No backend.** Fetch OSM/terrain/geocode straight from the browser. Cache OSM in IndexedDB.
- **Style:** low-poly `flatShading`. The neon/wireframe view is a decoration layer
  (`app/theme.ts`) over the same meshes — do not fork the world builders for it.
- **Neon coverage is mandatory.** Every world/scene mesh added to a city MUST switch
  look in neon via `ThemeController`, or it sticks out as a day-styled object in the
  dark neon world. Register it in `WorldRefs` and `theme.setWorld(...)`. Two patterns:
  non-instanced solids (buildings, roads) get hidden + replaced by glowing edge lines;
  **instanced** meshes (trees, lamps, signs) can't use edge-outlines (one edge geo can't
  replicate per instance) — flip their materials to neon `wireframe` + `emissive` in
  `apply()` and restore the saved day values off-neon. When you add a new world layer,
  wire it into the theme in the SAME change.
- **TypeScript strict**, plus `noUnusedLocals`/`noUnusedParameters` — prefix a deliberately
  unused param with `_`.
- **The world has an edge.** `src/world/bounds.ts` (`WorldBounds`) defines the drivable
  boundary. The world is built from a ±RADIUS *square* bbox, so the boundary is a **square**
  too — `rectBounds(EDGE_SOFT 965, EDGE_HARD 990)` half-extents. A circle was wrong: it left the
  corner buildings outside and braked you in the middle of the outer streets (v0.92.0 bug).
  `circleBounds` is kept for a genuinely round world. The car is confined by `confineToBounds`
  AFTER `stepCar` (physics stays pure): soft braking past the soft edge, hard backstop at the
  hard one, tangential motion kept so you can graze along it. `mistWall.ts` marks and hides the
  rim — a square tube with a fog-coloured veil (dense at the ground, colour tracks the fog) plus
  a bright amber marker band so the limit reads as deliberate, not a bug. Do NOT lean on the
  scene fog for this — it is CAMERA-relative and never veils the edge you drive TOWARD (the boats
  gotcha). Bounds are shape-swappable, so real OSM admin boundaries can drop in later.

## Testing approach

Pure functions are unit-tested (projection, OSM parse, Terrarium decode, road width,
building height, spatial grid, collision, car step). Rendering and driving feel are verified
manually / with a headless smoke — a subagent cannot see a browser, so for rendering changes
verify `tsc` + `build` + existing tests and defer the visual check to a human.

**Test the behaviour, not the shape.** A test that asserts a vertex count tells you nothing
when the bug is that two carriages are in the same place. Assert what a player would report:
that no two pickups share a spot, that a car on a 1-in-4 hill is not level, that a crowd
contains both kinds of walker.

**Measure before you fix anything about a real city.** Three fixes to boats in a row were
wrong because they were reasoned about instead of measured. The DEM decoder needs a canvas,
so put a scratch page in the repo root, serve it with `npx vite`, and drive it with headless
Chrome `--dump-dom`: you can then run the real pipeline — real Overpass, real terrain — and
print what it actually did. Delete the page afterwards.

## Gotchas (learned the hard way)

- **Module-scope temporal dead zone.** `main.ts` runs at module scope, so calling a function
  above a `const` it reads is a ReferenceError at startup — and TypeScript cannot see it
  through the function call. It shipped a black screen (v0.82.0) past clean types, 362 green
  tests and a clean build. `npm run boot-check` exists because of this; it looks for the gear
  button, built near main.ts's LAST line, since the canvas comes from its first and proves
  nothing.
- **InstancedMesh + `vertexColors: true` = black.** three's shader does `vColor *= color`,
  reading the geometry's colour attribute; a BoxGeometry hasn't got one, so WebGL feeds it
  zeroes and every instance is black before `instanceColor` is ever applied. Use `setColorAt`
  only — `USE_INSTANCING_COLOR` is defined the moment you do.
- **InstancedMesh culling.** three computes an InstancedMesh's bounding sphere once and never
  again, so a batch that moves gets frustum-culled as one and blinks in and out. Anything
  that moves: `frustumCulled = false`.
- **The OSM cache key must include the query.** It was the bbox alone, and every tag added to
  the Overpass query since was invisible in any city already cached — no railways, no trams,
  no rivers, for good. It hashes the query text now, so this cannot recur silently.
- **Water level is a LOCAL question.** `waterLevel` samples the bed inside the outline AND
  inside the map, and takes a low quantile. The lowest point of the outline is not local: the
  Nile's polygon is 73 km² and runs far past the map, so its lowest rim point is miles
  downstream and below the river beside Cairo — the water then sits under the ground for the
  whole city and boats sail over the grass. Measured: level 8.28 against a bed of 9.4–41.7.
- **An outline is not water.** Inner rings (islands) are not read, so Gezira is inside the
  Nile's polygon. Ask the ground, not the polygon, whether a spot is wet — and ask it about
  the whole circle a boat will travel, while CHOOSING the spot, not as a veto afterwards.
- **A step in the surface is not a slope.** Where the road meets a bridge deck the ground
  gains metres between two frames; read as a slope that is a climb of 100m/s, and the frame
  after it the car is fired twenty metres into the air. Compare the rise against the distance
  actually travelled: past what that could have climbed, it is a step, and you cannot ramp
  off a kerb. The mirror case is a step DOWN past `LEDGE_DROP` (a roof edge, the end of a high
  bridge): do NOT snap the car to the low ground — that read as dropping THROUGH the surface.
  Go airborne at the lip and carry the horizontal speed into an arc (`car.ts`, v0.94.0).
- **`at()` on a polyline clamps.** So anything positioned off the end of a line piles onto its
  first point. Every train carriage sat on the first metre of track and drove out of the
  others one at a time. Hide what is off the line instead.
- **Put things where the player is, not where the data starts.** Trains ran on whichever lines
  OSM listed first, boats at the widest water anywhere in the body, cars on any node at all.
  All three read as 'the feature is missing'. Sort by distance to the middle, and check a spawn
  point can be driven out of (`roomToDrive`) before using it.

- **Building extrusion.** `buildBuildings` builds a `THREE.Shape` from `(x, z)`, extrudes,
  then `rotateX(+π/2)` + `translate(0, base + height, 0)`. Using `−π/2` mirrors world Z vs.
  the footprint the collider uses — buildings then sit on the opposite side from their
  colliders. Keep the `+π/2` form.
- **Car friction.** Use exponential decay `speed *= Math.exp(-FRICTION*dt)`, not
  `speed -= speed*FRICTION*dt` (the latter flips sign when `FRICTION*dt ≥ 1`).
- **GPU cleanup.** On city switch, dispose old geometry/materials (and neon edge lines),
  not just `scene.remove` — removing from the graph does not free GPU buffers.
- **Ambiguous city names.** Nominatim returns the top hit; `Poti` may resolve elsewhere.
  Suggest `City, Country` or `lat,lon`.
- **Shared light materials.** `HEADLIGHT_MAT`, `REAR_LIGHT_MAT`, `TURN_*_MAT`, `LAMP_MAT`
  are module-level and driven from the render loop (one `emissiveIntensity`/`color` set
  per frame lights every instance). Only one vehicle is on screen at a time, so tinting
  the shared stop material per vehicle in `buildVehicleMesh` is fine. When you set a lens
  into a housing, the lens must stand *proud* of (in front of) the housing on the outward
  face, or the housing occludes it and it renders black (the v0.32 tail-light bug).

## Deploy

`.github/workflows/deploy.yml` builds and publishes `dist/` to GitHub Pages on push to
`main`. Vite `base: './'` keeps asset paths relative so it works on a Pages project subpath.

**Versioning / releases.** `package.json` version is injected as `__APP_VERSION__` (Vite
`define`) and shown as a UI badge. Per feature: bump the version (semver — minor for features,
patch for fixes), merge to `main`, then tag `vX.Y.Z` and push the tag —
`.github/workflows/release.yml` cuts the GitHub Release.

## Docs

- **`FEATURES.md`** is the player-facing list of everything the game does + the controls. **Keep
  it current: when you add a feature or change an existing one, update the relevant section of
  `FEATURES.md` in the SAME change** (the way you also bump the version and tick `TODO.md`). A
  feature that ships without a line in `FEATURES.md` is a feature players can't discover.
- Design spec and the full implementation plan are in `docs/superpowers/`.
