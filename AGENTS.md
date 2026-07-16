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
```

Before committing any change, `npm test` and `npx tsc --noEmit` must both pass, and
`npm run build` must succeed and leave no stray files (`git status --short` clean).

## Architecture

Layers with one-way dependencies. The **data layer knows nothing about Three.js**, and
the **world layer knows nothing about the network**. Keep it that way.

```
src/
  geo/       lat/lon↔meter projection, OSM parse, Overpass, Nominatim geocode, IndexedDB cache
  terrain/   ElevationProvider interface; Terrarium tile decode; FlatProvider fallback
  world/     mesh builders: ground (displaced plane), buildings (extruded), roads (ribbons)
  physics/   SpatialGrid + circle-vs-polygon collision (resolveCircle)
  vehicle/   arcade car step (pure) + Keyboard input
  app/       scene/camera/loop, theme (day/neon view), main.ts wiring
  ui/        city input, loading overlay
test/        unit tests mirror src/ for pure functions
```

Data flow: `geocode → bbox(1km) → Overpass (cache) → parseOsm → Projector → loadTerrarium
(→ FlatProvider on failure) → build ground/buildings/roads → SpatialGrid(footprints) →
createCar → startLoop(stepCar + syncCamera + render)`. All wired in `src/app/main.ts`.

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

## Testing approach

Pure functions are unit-tested (projection, OSM parse, Terrarium decode, road width,
building height, spatial grid, collision, car step). Rendering and driving feel are verified
manually / with a headless smoke — a subagent cannot see a browser, so for rendering changes
verify `tsc` + `build` + existing tests and defer the visual check to a human.

## Gotchas (learned the hard way)

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

Design spec and the full implementation plan are in `docs/superpowers/`.
