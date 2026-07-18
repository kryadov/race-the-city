# Map edge — keep the car on the map (v0.92.0)

## Problem
Two coupled defects the player hits at the rim of the world:
1. **Nothing confines the car.** After `stepCar`, `car.x/car.z` is never clamped, so you can
   drive off the 2·RADIUS (2000m) ground square into empty space where `heightAt` is undefined
   ground.
2. **The edge reads as a ragged void.** OSM's bbox query returns whole ways with at least one
   node inside ±1000m, so roads spill past the ground square and stop in mid-air.

## Key measurement (measure-before-fixing)
The always-on distance fog (`scene.ts`: `THREE.Fog(0x9fc4e8, 300, 900)`) is **camera-relative**.
The chase camera sits `back = 14·camDist` (≈14–42m) behind the car, toward the centre. So the
edge you drive **toward** is only ~150–190m from the camera — deep in clear air (fog starts at
300m). Fog hides the far and side edges, never the one you approach. Confirmed against the
"boats" lesson already recorded in AGENTS.md. Therefore the mist cannot be a fog tweak; it must
be a real object standing at the boundary.

## v0.92.1 correction — square, not circle
Shipped v0.92.0 with a **circle** (R950). Bug reported immediately: braked and shoved inward
"among the houses". Cause (deterministic, not a real-city guess): the world is built from a
±RADIUS **square** bbox, so buildings fill the whole square out to the corners (~1414m diagonally),
but a circle ≤1000m (it must stay ≤1000 to sit on the ground on the axes) cuts the corners — the
soft edge is reached at only ~671m per axis on a diagonal, deep among mapped streets. Fixed by
switching the boundary to `rectBounds` (square, half-extents 965/990) matching the ground.
Also, players couldn't tell the braking WAS the boundary, so the mist wall gained a bright amber
**marker band**, and its veil was made dense at the ground (it had peaked ~50m underground).

## Design (as corrected)
Boundary is a **square** (half-extents soft 965m, hard 990m) matching the square ground, built
against a `WorldBounds` abstraction so a real OSM admin-boundary polygon can drop in later with no
consumer change (real boundaries deferred — they almost always dwarf the 1km slice for the
major-city list, so they buy little now).

### `src/world/bounds.ts`
- `WorldBounds.probe(x,z) → { soft, hard, nx, nz }` — signed distances (metres) past the soft
  and hard edges (>0 outside), plus outward unit normal. Shape lives here only.
- `circleBounds(soft, hard)` — the circle implementation.
- `confineToBounds(movable, bounds, dt, brake=3)` — the braking **policy** (kept out of the
  shape): past the soft edge, bleed the OUTWARD radial velocity exponentially (harder the deeper
  in); keep the tangential component so you can graze along the edge; past the hard edge, clamp
  position and zero any remaining outward velocity. Driving inward is never braked. Pure and
  unit-tested.

### `src/world/mistWall.ts`
One inward-facing (`BackSide`) cylinder shell at R≈958, spanning y −50..+80, with a vertical
alpha ramp (DataTexture, dense at the ground → clear overhead). `MeshBasicMaterial`,
`fog:false`, `depthWrite:false`, `renderOrder:2` so it veils the road stubs behind it. Colour is
set each frame from `scene.fog.color`, so day/night and neon flow through it with no
ThemeController registration — it has no static look of its own; it *is* the fog colour.

### Wiring (`main.ts`)
- Constants `EDGE_SOFT=900`, `EDGE_HARD=950`, `const bounds = circleBounds(...)`.
- `const mist = createMistWall(EDGE_HARD + 8)` once, added to the scene (survives city switches).
- In the loop, after the mover resolve and before `onDeck`: `confineToBounds(car, bounds, dt)`.
- After `applyDayNight`: `mist.setColor(scene.fog.color)`.
- After a session-pose restore: `confineToBounds(car, bounds, 1/60)` so a pose saved on a wider
  map lands inside.

Road stubs past 950m are hidden by the wall, so road clipping is intentionally NOT done (YAGNI);
revisit only if a stub is seen poking through.

## Tests
`test/world/bounds.test.ts` — behaviour not shape: point past the soft edge reads `over`+outward
normal; inside is a no-op; outward speed bled while tangential kept; inward never braked; hard
backstop clamps position and kills outward speed while keeping tangential.

Rendering (the wall) is verified by a human — a subagent can't see a browser.

## Follow-ups
- Real OSM admin boundaries as a `WorldBounds` polygon (separate feature; pairs with the offline
  work that revisits the slice size).
- Optional road clip to the boundary if the wall ever fails to hide a stub.
