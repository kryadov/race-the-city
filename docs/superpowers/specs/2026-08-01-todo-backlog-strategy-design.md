# TODO.md Backlog Strategy & Cleanup

**Date:** 2026-08-01
**Status:** Approved (Section 1 cleanup + Section 2 roadmap)
**Approach:** C — Чередование (alternate visible/structural waves)

---

## Section 1: Cleanup TODO.md

Verified against source code on 2026-08-01. Every action below is backed by a
code reference.

### 1a. Stale items — implemented in code but still `[ ]` in TODO

| TODO line | Item | Action | Code proof |
|-----------|------|--------|------------|
| :286 | Forests / woodland | `[ ]`→`[x]` | `greenery.ts` — `collectForestSpots`, `MAX_FOREST_TREES=2000`, `buildGreenery(forests)`; `parse.ts:243` extracts; `main.ts:666` passes `world.forests` |
| :346 | Underwater bubbles | `[ ]`→`[x]` | `src/fx/bubbles.ts` (whole module); `main.ts:293` creates, `:1165` updates |
| :141 | Shopfronts / storefront windows | `[ ]`→`[x]` | `buildings.ts` — `buildShopfronts` + `shopfrontTexture`; `facade.ts:49-52` `shopfront:true` for retail/office/civic |
| :455 | World edge (big feature #1) | `[ ]`→`[x]` | `bounds.ts` + `mistWall.ts` exist; AGENTS.md confirms square bounds EDGE_SOFT 965 / EDGE_HARD 990. Design evolved circle→square (v0.92.0 bug fix) |
| :559 | Keep the car on the map | `[ ]`→`[x]` | Duplicate of :455 |

### 1b. Partially done

| TODO line | Item | Action | Detail |
|-----------|------|--------|--------|
| :289 | Railway stations + boarding | `[ ]`→`[~]` | Visual platform mesh + boarding/alighting logic **exist and complete** (`trains.ts:482` `buildPlatform` — slab, yellow edge line, canopy roof, lamps, figures; `board()`, dwell at `:801-824`). **Still open:** Overpass queries only railway lines (`overpass.ts:98` `railway~"rail\|light_rail\|tram\|narrow_gauge"`), NOT `railway=station\|platform\|halt`. Platforms are placed procedurally along tracks, not at real OSM station positions. Finish = add station/platform tags to Overpass query + place platforms by real data. |

### 1c. Consolidate duplicates

- **Bigger map** (3 copies → 1): merge :106, :169, :616 into one canonical item
  at :169 (most detailed). Delete :106 and :616. Scale: "adaptive ×1.5–×2,
  measure first". Dependencies: Web Worker (parsing perf) + LOD/subsample work.

### 1d. Resolve inconsistencies

- **:533 Birds still wrong** — model fix (v0.93.0 `bodyGeometry`) + perch fix
  (v0.110.60 crown height + canopy clamp) both done. Sub-points about
  "вертикально падают" and "плоско" likely stale. Action: check `birds.ts`
  takeoff→perch transition; if present, mark `[x]`, leaving only real remnants.
- **:184 Waterfront railings + curb** — split: collision done (v0.144.2,
  `[x]` :130); railing mesh exists in `water.ts` (posts+rail); **still open:**
  one-way soft barrier (drove into water → can drive back out). Rewrite :184
  as one-way barrier only.
- **:657 Rivals/traffic as solid obstacles** — split: car-to-car separation
  done (:356 `[x]`); bot-vs-parked-car + bot-vs-bot are weak spots per
  AGENTS.md. Rewrite :657 as "bot-vs-parked-car + bot-vs-bot separation".
- **:292 Bot buses** — add version note (boarding/alighting in
  `buses.ts:128-129,453-461`).

---

## Section 2: Roadmap — Waves

Approach C (Чередование): alternate visible-to-player waves with structural/
performance waves. Each structural wave carries one visible feature.
Dependencies respected: bigger map → after Web Worker; signage text → can ride
with Web Worker (text atlas is CPU work); offline packs → after bigger map;
multiplayer → after offline packs.

### Genuinely open items (verified absent from code)

**World & atmosphere:** Signage text (`:394`), Sandy ground (`:619`),
Moon at night (`:561`), Elevation exaggerated (`:565`, needs headless
measurement), More cities (`:579`), Roof shapes (`:525`),
Emergency vehicles (`:588`), Halloween pumpkins (`:448`),
Spring sakura (`:449`), Pickable car-objects (`:329`).

**Vehicles & physics:** Custom vehicle colours (`:636`), Damage/dents (`:642`).

**UX:** Minimap zoom touch (`:404`), Taxi in ⚙ in-game menu (`:407`),
People use doors (`:412`), Cancel button on OSM load overlay (`:113`).

**Performance / tech debt:** Web Worker for parsing (`:717`),
Overpass caching proxy (`:713`), E2E test of real city load (`:729`),
boot-check in CI (`:730`).

**Platform (big):** Offline packs/PWA (`:463`), LAN multiplayer (`:483`),
Analytics backend (`:209`).

**Visuals:** Bloom for neon (`:680`), Water reflections (`:681`),
Rounder low-poly buildings (`:682`).

**Audio:** Positional audio (`:696`).

### Wave ordering

#### Wave 0 — Cleanup release
Apply Section 1 edits to TODO.md. Expand the random cities list (`:579`).
Patch bump. Documentation only, no code changes.

#### Wave 1 — Visible: world textures
- **Signage text** (`:394`) — canvas-texture atlas on existing nameplate/
  signpost meshes. Cap how many render at once; fade by distance.
- **Sandy ground** (`:619`) — add `natural=sand|desert|bare_rock` to Overpass
  query; tint in `ground.ts`. Small query change + vertex tint.
- **Moon at night** (`:561`) — look-check first, then adjust size/brightness in
  `sky.ts`.
- **Cancel button** (`:113`) — AbortController on OSM load overlay.
  Distributed from former Wave 6 (loading UX, pairs with textures).
- **Roof shapes** (`:525`) — better height heuristics. Distributed from former
  Wave 6 (world textures theme).

CPU-light, no architectural changes. 1 release.

#### Wave 2 — Structural: parsing performance
- **Web Worker for parse/mesh build** (`:717`) — eliminates load-time hitch.
- **boot-check in CI** (`:730`) — dead build can't deploy.
- **Visible feature carried: People use doors** (`:412`) — door positions
  already exist in `entrances.ts`; spawn/despawn pedestrians at door, small
  hinge open/close animation. Logic lives in pedestrians, not parsing.

1-2 releases.

#### Wave 3 — Visible: city life
- **Railway stations by real OSM data** (`:289` — finish the `[~]`) — add
  `railway=station|platform|halt` to Overpass; place `buildPlatform` at real
  positions instead of procedural.
- **Pickable car-objects** (`:329`) — rare parked cars for type swap. Reuses
  `carPickups.ts` from arcade mode.
- **Taxi in ⚙ in-game menu** (`:407`) — make settings-menu modes single-select;
  add taxi.

1 release.

#### Wave 4 — Structural: map scale
- **Bigger map adaptive ×1.5–×2** (`:169`, consolidated) — after Web Worker.
  LOD/subsample distant detail + per-type caps. Measure frame time before/after.
  Adaptive: don't expand where no buildings exist past current radius.
- **Visible feature carried: Emergency vehicles** (`:588`) — fire engine,
  police car, ambulance. Livery + light bar; reuses shared light materials
  from `models/parts.ts` (driven per frame per AGENTS.md).

1-2 releases. **Decision point:** if bigger map costs frame rate, roll back
scale, keep emergency vehicles.

#### Wave 5 — Visible: polish
- **Minimap zoom buttons** (`:404`) — pointer events for touch.
- **Custom vehicle colours** (`:636`).
- **Bloom for neon** (`:680`) — post-processing pass.
- **Water reflections** (`:681`) — measure frame rate per AGENTS.md; defer if
  costly.
- **Damage/dents** (`:642`) — collision bounce with impulse.
- **Positional audio** (`:696`) — engine quieter as camera pulls back.
- **Halloween pumpkins** (`:448`) + **Spring sakura** (`:449`) — seasonal,
  instanced, same pattern as POI signs. Ship when calendar date approaches or
  bundle here.

1 release. Flagged: bloom + water reflections are the frame-rate risks;
measure before committing.

#### Wave 6 — Structural: measurement & data
- **Elevation exaggerated** (`:565`) — headless Chrome fetch comparing
  `heightAt` range vs known ground truth for SPb/Helsinki. Determines: source
  problem (Terrarium artifacts) vs look problem (flat-shading dramatises).
- **Overpass caching proxy** (`:713`) — if rate limits hit.
- **E2E test of real city load** (`:729`).

1 release. (Former Wave 7, renumbered after Wave 6 dissolved.)

#### Wave 7 — Platform: offline
- **Offline packs / PWA** (`:463`) — service worker for app shell + on-demand
  offline cache of OSM (already IndexedDB) and terrain tiles. "Download for
  offline" action. ODbL question for store-build redistribution (on-demand
  cache is user's own copy, sidesteps it).

Separate release. Brainstorm first.

#### Wave 8 — Platform: analytics + multiplayer
- **Analytics backend** (`:209`) — brainstorm free-tier options (not
  necessarily AWS), privacy/GDPR, could double as multiplayer transport.
- **LAN multiplayer** (`:483`) — WebRTC P2P + signaling, or optional local
  companion server. Existing design at
  `docs/superpowers/specs/2026-07-18-lan-multiplayer-design.md`.

Separate releases. Both require brainstorm first.

### Wave dependency graph

```
Wave 0 (cleanup)
  └→ Wave 1 (world textures)
       └→ Wave 2 (parsing perf + doors)
            └→ Wave 3 (city life)
                 └→ Wave 4 (map scale + emergency vehicles)
                      └→ Wave 5 (polish)
                           └→ Wave 6 (measurement & data)
                                └→ Wave 7 (offline/PWA)
                                     └→ Wave 8 (analytics + multiplayer)
```

### Items not placed in any wave

- **Rounder low-poly buildings** (`:682`) — aesthetic, no clear home. Candidate
  for Wave 1 or Wave 5 if room; otherwise defer until a world-building wave
  naturally arises.
- **Underwater bubbles** (`:346`) — already shipped (Section 1a). Removed from
  open items.

---

## Implementation

Each wave gets its own spec → plan → implementation cycle. Wave 0 (cleanup)
is documentation-only and proceeds directly to `writing-plans`. Waves 7 and 8
require a fresh brainstorm before spec.
