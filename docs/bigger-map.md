# Bigger map: what it would actually cost

Research note, 2026-09-06. Answers the backlog item "**Bigger map (×2 diameter)
without frame-rate loss, adaptive**" (TODO.md) with measurements rather than
guesswork. Nothing here is implemented yet — this is the groundwork for the
brainstorm.

## Where the size lives today

| Knob | Where | Value |
|---|---|---|
| World half-extent | `src/app/main.ts:165` | `RADIUS = 1000` (a 2×2 km square bbox) |
| Drivable edge | `src/app/main.ts:172` | `EDGE_SOFT 965` / `EDGE_HARD 990` |
| Ground mesh resolution | `src/app/main.ts:181` | `GROUND_SEGMENTS = 160` → 12.5 m cells |
| Fog | `src/app/scene.ts:73` | 300 → 900 m |
| Per-mirror request ceiling | `src/geo/overpass.ts:37` | `REQUEST_TIMEOUT_MS = 30_000` |
| Terrain tiles | `src/terrain/terrarium.ts:74` | zoom 14, fetched **sequentially** in a nested loop |

What scales with area, and what does not:

- **Scales**: buildings, roads, the ground mesh, the OSM payload, the DEM tiles.
- **Does not scale**: the scattered detail. Trees (`MAX_TREES 600`,
  `FOREST_TREE_CAP 2000`), street furniture, traffic, pedestrians, trains and
  boats are all globally capped and density-scaled, so on a bigger map they
  spread thinner rather than multiply. They are not the problem.

## Measurements

Overpass `out count` for `way["building"]` + `relation["building"]`, same centres
the game uses, 2026-09-06:

| City | r = 1000 m | r = 2000 m | growth |
|---|---:|---:|---:|
| São Paulo | 6 723 | 32 638 | **×4.9** |
| Prague | 4 065 | 13 728 | ×3.4 |
| Suzdal | 1 789 | 3 793 | ×2.1 |

Server response times for those counts ranged 25–90 s and were dominated by
mirror queueing, not by the size of the answer — a *count* query is small. A
full-body query for 32 638 buildings is tens of megabytes, i.e. comfortably past
the 30 s per-mirror abort we currently fail over on.

The spread between São Paulo (×4.9) and Suzdal (×2.1) is the whole case for
making the radius adaptive: a village genuinely can afford 4× the area, a dense
downtown cannot.

## Why bumping `RADIUS` alone does not work

1. **Buildings are merged into a handful of big meshes per class**
   (`src/world/buildings.ts:158`, `batchMesh`). Great for draw calls — and it
   means three.js cannot frustum-cull any of it. Every vertex is transformed
   every frame regardless of where the camera looks, and regardless of the fog
   hiding it past 900 m. At ×5 the buildings that is millions of non-cullable
   vertices.
2. **Load-time cliff.** ~33 k buildings is a multi-tens-of-MB JSON body against a
   30 s per-mirror ceiling, then parse, then extrusion and merge on the main
   thread — a multi-second freeze on the loading plate, plus an IndexedDB cache
   entry large enough to risk the browser's quota.
3. **The ground coarsens.** `GROUND_SEGMENTS` is fixed, so doubling the radius
   takes the terrain cell from 12.5 m to 25 m. The car drives on the sampled
   surface, so that is a real handling/visual regression, not just a cosmetic one.
4. **DEM loading is serial.** `loadTerrarium` awaits each 256 px tile inside a
   nested loop. A 2 km box is up to 2×2 tiles; a 4 km box is up to 3×3 — more
   than twice the wall-clock, for no reason.

## The order that pays

1. **Tile the merged building meshes** (≈250 m grid, per class per tile) and hide
   tiles beyond the fog. This turns per-frame cost from O(area) into O(visible).
   It is the only step that improves frame time **at today's radius**, and every
   later step depends on it.
2. **Fix the loading path**: split the bbox into four quadrant queries fetched in
   parallel (finer cache granularity and progressive reveal come free), build the
   geometry in chunks across frames instead of one blocking pass, and turn the
   `loadTerrarium` loop into a `Promise.all`.
3. **Adaptive radius**: a cheap `out count` probe before the real fetch decides
   between ~1000 and 2000 m for that city. Sparse places expand, downtowns do not.
4. **Scale `GROUND_SEGMENTS` with the radius** (160 → 320) so the terrain cell
   stays at 12.5 m; consider tiling the ground mesh at that point too.

An interim ×1.5 (1000 → 1500, 2.25× the area) is cheaper than ×2 but still
requires step 1 first.

## Next step

Brainstorm step 1 on its own, implement it, and measure frame time before/after
at the current radius. Only then is the radius itself worth touching.
