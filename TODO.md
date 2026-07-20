# TODO / Ideas

Backlog of ideas for Race the City. Shipped features live in the git tags / releases
(v0.1.0 … current); this file tracks what's next.

## 🎮 Play-test backlog — 2026-07-19 (live session)
Asked during a play-test; deferred here so they aren't lost. Ship order: bugs first, then polish.

### ✅ Shipped this session (v0.110.26 → v0.110.53) — see CHANGELOG for detail
Fixes: bridge arch launch/judder (real-city measured); collisions gated by height (fly-over / bridge
decks / slopes); smooth ram knockback; **Overpass 429 / infinite load** (30s timeout + 3rd mirror +
stale-cache fallback) + **Cancel button**; signpost pole through panel; benches/flowerbeds/monuments
(were the 429 features-query stall). Features: day/night lock, underwater bubbles, fuel toggle,
nitro-along-highways, forests, seasonal clothing, level-crossing barriers (road×rail), bot buses,
bot motorcycles, natural door colours + handles, benches/trees between houses, RPM tacho, bird
colours + white crow, favicon, parked cars in lots, glazed shopfronts, waterfront railing collision,
holiday fireworks, pedestrians on bridge decks. (In flight: railway platforms+boarding, bot cyclists.)

### 🔧 Bugs in shipped features (fix next)
- [ ] **Start position must not face/abut a building or have the view blocked** — the player must not
      spawn staring into a wall or with a house (or other obstacle) blocking the chase-camera view.
      DIAGNOSED: `src/world/start.ts` `startPose()` picks the road vertex nearest the map centre and a
      heading along the road, but never checks what's ahead/around. Fix: score candidate road vertices
      (a) by openness — reject/penalize a spot whose forward direction (and the chase-camera, which
      sits BEHIND+ABOVE the car) hits a building footprint within a few metres; pick the heading (either
      way along the road) and the vertex that leaves the car facing clear road, not masonry. Needs
      `startPose` to take building footprints (`world.buildings`) + a short ray/box test. Ship as a fix.
- [ ] **Roads run straight into houses; bots drive into the wall → SOLVE WITH ARCHWAYS** (screenshot
      2026-07-19: a road disappears into a building's side, bot cars follow it into the masonry, "ехали
      наполовину в доме"). USER DECISION: don't just cull the edge — where a (non-tunnel) road/track
      crosses a building footprint, **render the building bridged over the way with an open archway/
      passage**, and let BOTH bots and the PLAYER drive through it. This is the canonical
      **"Road/rail-through-building archways"** item lower in this file — do it there. Detect way ×
      building-footprint crossings (or OSM `covered`/`tunnel`/arch tags), carve/raise a passage in the
      merged building mesh, keep the road drivable through it, and make the passage span collidable
      above head height only. Applies to roads and rail. Needs its own design.
- [ ] **Moving bots drive through PARKED cars on a lot** (screenshot 2026-07-19, night) — bot traffic
      (and buses) pass straight through the static parked cars filling a parking lot. Parked cars
      (`parkedCars.ts`) are not in the collision/obstacle grid and `traffic.ts` doesn't treat them as
      blockers. Add each parked car's footprint as a solid obstacle so bots (and the player) go round.
- [ ] **No moving bot cars on bridges** — bridge decks carry no traffic; they should. Traffic walks the
      ground road graph, and bridge-deck segments either aren't fed to the traffic graph or are dropped
      by the on-ground height test. Route bots over bridge crossings the way the player drives them.
- [ ] **Support more OSM ground-surface types (not just grass)** — user sees ground on the OSM map that
      isn't grass and wants it rendered. MEASURE FIRST (measure-before-fixing): fetch a real city's OSM
      and enumerate which area tags actually appear (`landuse=residential/commercial/industrial/meadow/
      farmland/grass`, `natural=scrub/heath/sand/bare_rock`, `surface=*`, `leisure=*`), then map the
      common ones to distinct ground tints/textures. Ties into "Sandy ground in southern cities" and
      "Pedestrian squares". Ground build (`ground.ts`) + parse (`parse.ts`). Screenshot 2026-07-19 (OSM
      carto) shows at least: pale-cream **farmland**, light-green **meadow/grass**, dotted-green
      **orchard/scrub**, grey **residential** landuse, tan buildings — support farmland/meadow/orchard/
      residential as distinct ground tints as the first cut.
- [x] **Menu — comprehensive rework** — ✅ v0.112.0: one unified menu (start + Esc), branded main screen,
      single-select mode picker (Free · Time-trial · Race · Taxi · 🕹 Find-a-car), settings behind ⚙ Options.
- [x] **Some birds perch in mid-air on nothing** — ✅ v0.110.60: each tree hands the flock its real crown height. a few birds sit motionless in the air with nothing
      under them (regression of the earlier "sitting in the air" fix, or perch points chosen above a
      surface). Check `src/app/birds.ts` perch/idle placement — perches should sit on a roof/tree/ground.
- [x] **Bridges over a wide river render incorrectly** — ✅ v0.110.61: piers spaced ~25m + span-deep girder. screenshot (Santiago): the arched bridge
      **railings** are there but the **deck/roadway across the water reads wrong** (decks look thin /
      floating / disconnected from the banks, or the arch is over-humped on a wide span). Check
      `src/world/bridgeMesh.ts` (deck surface + piers + railing) and `deckHeights`/`MAX_ARCH` for wide
      water crossings.
- [x] **BUG (serious) — waterfront barrier walls off bridges (v0.110.52)** — ✅ FIXED v0.110.58 (collision removed entirely). invisible collision
      across a bridge approach where a river runs under it (Santiago ~x-192 z-684): you can't drive the
      bridge/road, only pass well to the side. `waterBarriers` puts a wall along the whole embanked
      water edge including where a **road/bridge crosses** it. Fix: pass `roads` to `waterBarriers` and
      **leave a gap** wherever a (non-tunnel) road crosses the edge — never wall a carriageway. Also
      gate barriers on the SAME condition the mesh actually draws the stone/rail, so no invisible walls.
- [x] **Parked cars look wrong (v0.110.50)** — ✅ v0.110.62: wheels/lamps, seated on tarmac, bay rows, thinned. screenshot: they read as dark flat boxes **sunk into
      the tarmac**, in **one dense line**, too many, **no wheels / head- or tail-lights**. Fix
      `src/world/parkedCars.ts`: give them a proper low-poly car body (wheels, glass, lamp dabs), seat
      them ON the surface (BODY_Y too low — they're sinking), lay them in **proper bay rows** across
      the lot (not a single kerb line), and thin the count.
- [x] **Tachometer (v0.110.47)** — ✅ v0.111.1: smaller dial + smooth per-vehicle rev model (src/app/revs.ts). (a) make the dial **~1.5× smaller** than the speedometer; (b) the
      needle **jumps like a clock** (the gear-staircase RPM in main.ts snaps up to ~6k then back with
      lag) and **doesn't reflect each vehicle type** correctly — replace the gear-staircase with a
      smooth rev model that eases and is scaled per `VEHICLES[type]`.

### ⏳ Still open / bigger — need design or a review pass
- [x] **Menu refactor + arcade "find a car"** — ✅ v0.112.0 (menu, Esc-reachable modes) + v0.113.0/113.2
      (find-a-car: drive into a pickable car to swap type; v0.113.2 stops it offering your current type).
- [ ] **Combine harvester mows fields** — drive a combine over tall grass/wheat → mown stubble, hay
      bales form behind. Fields need a mown state + the harvester in its wake. Design-level.
- [x] **Neon mode skips the car & bots** — ✅ v0.113.1: movers flag `userData.neonMover` ('hero'|'bot');
      theme scans the scene live each toggle + on `refreshMovers()` (car swap / crowd rebuild), flipping
      MeshStandardMaterials to wireframe+emissive (white car, amber bots). v0.113.2 completed coverage:
      traffic, buses, motos, cyclists, pedestrians, trains, boats, livestock, birds, aircraft, arcade pickups.
- [ ] **Bigger map ×2, adaptive** — see note below. Brainstorm.
- [ ] **Relation-buildings (Boston)** — parse multipolygon `relation["building"]`. NOTE: adding it to
      the Overpass query changes the cache-key hash and evicts every cached city — hold until the
      rate-limit situation is comfortable, since cache is the offline lifeline right now.

- [ ] **Cancel button on the "загружаю карту OSM" overlay** — add a localized **Отмена/Cancel**
      button to the loading plate that aborts the in-flight load (fetchOsm now takes an AbortSignal —
      wire an AbortController from loadCity to it) and returns to the menu / stays on the current map.
- [x] **BUG — neon mode skips the car and bots** — ✅ v0.113.1/v0.113.2: car + every mover (traffic,
      buses, motos, cyclists, pedestrians, trains, boats, livestock, birds, aircraft, arcade pickups)
      now flips to neon wireframe via the `userData.neonMover` scan in theme.ts.
- [ ] **BUG — collisions ignore height (flying / bridges / slopes)** — obstacle circles (`solidAt`)
      are 2D, so the car collides with a bot even when it's ~10m ABOVE it: flying over a pedestrian on
      a slope, or driving a bridge deck over traffic on the road beneath. Give each obstacle a y
      (ground height) and skip the collision when |car.y − obstacle.y| exceeds a clearance. (main.ts
      collision + traffic/pedestrians obstacle lists.)
- [ ] **RPM tachometer dial** — above the speedometer, an engine-RPM dial (same round-gauge style),
      driven from engine load/speed. (`src/ui/hud.ts` + a `hud.setRpm` wired in main.ts.)
- [ ] **Pedestrians can walk the bridge decks** — let pedestrians route over bridge crossings/decks,
      not just ground roads (they currently stay on the ground under the bridge).
- [ ] **BUG — car can drive through the waterfront railing** — the new embankment railing (набережная)
      looks great and bubbles are great, but the railing/curb has no collision; add a soft one-way
      barrier so the car can't cross into the water (but can drive back out if it got in).
- [ ] **Birds — varied natural colours + rare white crow** — give birds a range of natural plumage
      colours (not all one), and occasionally spawn a white crow/raven.
- [ ] **Motorcycle bots** — add bot motorcycles to the traffic.
- [ ] **Shopfronts / storefront windows** — render shop and service-business frontages on ground
      floors of buildings (glazed retail fronts, signage) where OSM tags a shop/amenity.

- [x] **BUG — signpost pole pierces the panel** — ✅ v0.110.63: pole stops at the panel bottom, tucked behind. on POI/landmark signposts the post pokes up
      *through* the sign panel, which looks ugly. `src/world/poiMarkers.ts` mounts the panel near the
      top of the post (POST_H) but the post runs its full height behind/through it — stop the post at
      (or just below) the panel, or move the panel to the post's top so the pole doesn't stick out.
- [x] **Manhole perpendicular stripes** — ✅ already shipped (ribs v0.110.38, bolts/ajar v0.110.19); regression tests added this session. draw perpendicular hatch stripes on the manhole cover
      (`src/world/manholes.ts`) for a more realistic ironwork look.
- [x] **Menu refactoring — modes reachable, arcade mode selectable** — ✅ v0.112.0: Esc opens the unified
      menu with the single-select mode picker, arcade (🕹 Find-a-car) among them.
- [x] **Arcade mode: "find a car"** — ✅ v0.113.0/113.2: `carPickups.ts` scatters pickable cars of
      varied type; drive into one to become it. v0.113.2 excludes your current type + neon-flips them.
- [ ] **Combine harvester mows fields** — drive a combine onto a field of tall grass/wheat: the
      sectors you pass over turn to **mown stubble**, and a few sectors behind, **haystacks / hay
      bales** form in the harvested strip. Field sectors track a mown state; harvester lays bales in
      its wake.
- [ ] **Doors — natural colour + varied handles** — the door brown looks unnatural; replace it with
      a more natural palette (a few wood/painted tones) and add **a couple of different handle types**
      (knob, lever/bar) so doors read properly. (Door geometry lives with the building facades /
      entrances — `src/world/entrances.ts` / `buildings.ts`.)
- [ ] **Fill the gaps between houses** — where there are no roads or other objects between buildings
      it's bare; scatter at least **a couple of benches and some trees** into those empty inter-building
      gaps so the space isn't blank. Place only where nothing else already is (roads/props/water).

- [ ] **BUG — nitro spawns beyond the map edge** — nitro (and probably fuel) pickups appear outside
      the drivable map. They scatter on road vertices (`pickups.ts` setSpots / pickSpot), and some
      roads run past the map bound — clamp candidate spots to within the world radius (drop or pull in
      any spot outside `RADIUS`/bounds) so no pickup sits off the edge.
- [ ] **Bigger map (×2 diameter) without frame-rate loss, adaptive** — raise `RADIUS` (1000 → 2000)
      so the drivable world is twice across, BUT only where it pays: **if there are no buildings past
      the current radius, don't expand** (a village shouldn't fetch/scan 4× the empty area). 4× the
      area is 4× the OSM + geometry, so it MUST stay performant — lean on the existing per-type caps,
      subsample/LOD distant detail, and cull. Ties into the São Paulo bbox/query work. Measure frame
      time before/after. Design carefully before building — likely a brainstorm item.
- [ ] **BUG — benches gone from streets** — across several cities the user no longer sees any
      street benches (park ones may be ok). Regression suspect: `streetFurniture.ts` roadside
      placement caps/`nearestRoad`/ROADSIDE_DIST — check they're actually being placed and drawn
      (and that `world.benches` is populated from OSM `amenity=bench`). Not touched by any live agent.
- [ ] **BUG — water floats above the ground** in places (screenshot): a river/lake plane sits higher
      than the terrain of its bank, hovering with a visible edge. Suspect `waterLevel(ring, provider)`
      in `src/world/water.ts` picking too high a level (e.g. a max instead of the bank minimum), or
      the water plane not being lowered to the bed. Measure the sampled level vs the surrounding
      ground, then seat the surface at/just below the bank. (Water module — free of the live agents.)
- [ ] **Waterfront railings + curb** — where a lake/river has an **embankment/quay (набережная)**,
      fence it with a **railing** and a **curb the car can't cross into the water**; but if the car
      DID get in, it can drive back out (one-way soft barrier). Ties into the pedestrian water-avoid
      work and boats.
- [x] **Boats: better hull + rower** — ✅ v0.111.0: tapered double-ender hull + rowing figure. make the rowboat **more boat-shaped** and give it a **little
      figure rowing with oars** (animated stroke). `boats.ts` rowboat model + a per-boat oar animation
      in the update loop; keep it cheap.
- [ ] **BUG — Boston: sparse roads but ZERO buildings.** Roads render (sparse), buildings don't —
      so the fetch partly works. Diagnosis: the OLD combined Overpass query, truncated under load,
      streams `highway` (first in the query) then gets cut off before `building` → roads survive,
      buildings don't. v0.110.10's split buildings query SHOULD fix it — **verify on a reloaded
      build (the app itself is cached)**. If Boston is STILL empty on v0.110.10: (a) add
      `relation["building"]` to `buildingsQuery` AND parse **multipolygon buildings** (parse.ts today
      handles relation multipolygons for WATER only — `way["building"]` misses courtyard/complex
      buildings), and/or (b) handle `building:part`. Measure Boston's real OSM building count first.
- [ ] **BUG — São Paulo (and maybe other dense cities) render almost no buildings.** FINDINGS so
      far: the geocode is FINE — "São Paulo" → -23.5507,-46.6334, dense downtown, RADIUS 1000m, so
      buildings exist in OSM there. The suspect is `src/geo/overpass.ts` `overpassQuery`: ONE heavy
      combined query (highway+building+water+greenery+tourism/historic+…) at `[timeout:25]`. On a very
      dense city that likely **times out or gets truncated**, dropping most buildings. NEXT: measure
      in headless — run the real `fetchOsm` for São Paulo, log the building element count and whether
      Overpass returns an error/partial. Likely fix: **split buildings into their own query** (and/or
      raise the timeout, add a retry, or shrink the bbox for dense areas). Hold until the
      landmark-marker agent frees overpass.ts.

> **Hard constraint on every item below: it must not cost frame rate.** New ambience/props are
> instanced or capped and culled; anything per-frame (crowd AI, water tests, weather) stays O(few)
> and async where it touches the network. If a feature can't be done cheaply, it doesn't ship as-is.

- [ ] **Localize the start-menu title** — the stylized "RACE THE CITY" logo should switch per
      language (RU: **"Мчись по городу"**). While in there, audit for any other still-English strings
      and fold them into i18n. User also wants this to feed a broader **"support for new languages"**
      effort (beyond EN/RU) — treat the title as the first step of that. (Deferred: "не сейчас, как
      доберёшься".)
- [ ] **Analytics / usage stats** — how many players and from where, the most-popular city, etc.
      Needs a server side (the app is currently backend-free static hosting). User wants a
      **brainstorm on free-tier options — NOT necessarily AWS** — for standing up a minimal
      backend, ideally one that could later **double as the multiplayer transport (#6)**. Privacy/GDPR
      + "no backend" identity of the project are real constraints to weigh. (Deferred: "как дойдём до
      этого пункта" — needs a brainstorm before any build.)
- [x] **BUG — no boaters on small lakes** — v0.108.1: `spots()` skipped any water below
      ROWBOAT_ROOM (14m) AND the 40m whole-map sampling grid stepped right over small ponds. Added a
      fine per-ring bbox rescue sweep down to a new `MIN_ROOM` (6m) floor when the coarse sweep finds
      nothing, so a genuine pond now floats a rowboat. `test/app/boats.test.ts` locks it.
- [ ] **BUG — pedestrians walk across the bottom of water** — people path straight through lakes/
      ponds instead of going around. Need the pedestrian walk in `people.ts`/`pedestrians` to treat
      water polygons as obstacles (avoid/route around), the way traffic avoids buildings.
- [ ] **Bench-sitting by the water** — place benches beside lakes and have pedestrians **walk up,
      sit down, sit a while, stand and leave** (a small state machine: approach → sit → idle → rise →
      wander off). Ties into the water-avoidance work above and the existing `streetFurniture` benches.
- [ ] **BUG — birds sometimes perch in mid-air** — a perched bird occasionally floats with nothing
      under it. Likely a TREE perch (TREE_PERCH_H≈4.5m) with the render offset (ox/oz ±3.5m) putting
      the bird out beyond the canopy, worsened by PERCH_SCATTER snapping to distant/absent trees.
      Measure where floaters perch; fix by keeping the offset within the canopy for tree perches (or
      only tree-perch when a real tree/canopy is there). birds.ts — free of agents.
- [x] **Flowerbed stems** — v0.108.7: blooms on varied-length stems (dome + jitter).
- [x] **Flowerbed colours + flower shape** — ✅ already shipped (petalled blooms + blue/violet/azure, commit 051b082); regression tests added this session. the blooms currently read as **mushrooms**; give them
      actual **flower shapes** (a small petalled head — a ring of petals around a centre, not a plain
      squashed sphere) and add **blue, violet and azure** to the palette alongside the pinks/golds.
      `props.ts` bloom geometry + colour list, still merged (one draw per colour).
- [ ] **Nitro along cross-city highways** — place nitro so that where a **straight/near-straight
      highway runs clear across the city**, the bottles are spaced to let you **boost the whole way
      across the map** (chain the pickups). But **don't put them too close** (respect APART_MIN /
      keep them findable). Needs a straight-run detector over the road graph in the pickup scatter
      (pickups.ts + the road structure) — design first: identify long low-curvature runs, drop
      bottles along them at ~boost-window spacing.
- [x] **Colour-coded nitro** — ✅ v0.113.0: `NITRO_TYPES` table (blue standard / red short-hard /
      green long-gentle) → colour, top-speed mult, accel bonus, duration; `createPickups<T>` now
      carries a per-bottle payload so `nitro.update` reports the collected type, and main.ts sets
      `boostTimer/boostMult/boostAccel` from it. Tests in `test/app/nitro.test.ts` + `pickups.test.ts`.
- [ ] **Living parking lots** — parking areas should hold **a few parked cars of varied type and
      colour** (not packed — enough to read as a car park), and cars should **drive in, park, sit,
      then drive out** again. Reuse `world.parking` polygons + the vehicle roster; a small occupancy
      state machine (arrive → parked dwell → depart) feeding off the traffic graph for approach/exit.
- [ ] **Delivery cargo by vehicle type** — the deliver-a-fare/parcel mode should carry **different
      loads per vehicle**: a car carries a **person** (and a status/luxury car carries a smartly-
      dressed one to match), a truck/lorry carries **cargo — sand, gravel, fuel, milk** (pick a
      fitting load per hull). Swap the "passenger" figure for a typed cargo mesh in `taxi.ts`.
- [ ] **Road/rail-through-building archways** — bot cars (and **railways** — "как обычная, так и
      железная") sometimes run where a way passes **under a building**, and the road/track appears to
      vanish into the wall (screenshot). Detect these (way crossing a building footprint, OSM
      `covered`/`tunnel`, or a building with an arch) and **render the building bridged over the way
      with an open passage** — so it reads right AND the **player can drive through** it too (bots can
      now, the player can't). Applies to both roads and rail lines.
- [ ] **People get in and out of cars** — a pedestrian can walk up to a (parked) car, get in and the
      car drives off; and an arriving car can drop one off. Pairs with living parking lots and the
      taxi passenger figures already in `taxi.ts`.
- [ ] **Arcade mode: Police / Robber (tag)** — a mode where you're **either the police (goal: touch
      the runner) or the runner (goal: avoid being touched)**. AI drives the other role on the road
      graph; win/lose on contact or a timer. Slots into the start-menu mode list + `applyTrial`/
      `applyTaxi`-style wiring, reusing rivals/traffic AI for the opponent.
- [ ] **Traffic lights + obey them** — **signals at junctions**, and both **cars and pedestrians go
      only on green** (stop line on red/amber). A per-junction light phase clock; `traffic.ts` and
      `pedestrians.ts` agents check the light for the edge they're entering and hold at the stop line.
      Keep the check O(1) per agent (light state cached per node).
- [ ] **Trains: real windows + smooth motion** — give train cars **proper individual windows**, not
      one stripe running the whole length; and on **curves and grades** the cars should **turn/pitch
      smoothly** instead of snapping/jerking. `trains.ts` — window geometry per car + ease the car's
      yaw/pitch along the rail (sample ahead/behind on the polyline, interpolate) so it flows.
- [ ] **Level-crossing barriers** — drop **boom barriers (шлагбаумы) at railway crossings** that
      lower when a train approaches and raise after it passes. Reuse `trains.ts` timing + the road/rail
      intersection points; a hinged bar mesh + a simple down/up animation gated on train proximity.
- [ ] **Forests / woodland** — support and render **large wooded areas** (OSM `landuse=forest`,
      `natural=wood`): fill the polygon with **instanced trees** at a sensible density (capped +
      culled), not just the scattered `natural=tree` points. Reuse the greenery tree instancing.
- [ ] **Railway stations with platforms + boarding** — draw rail stops as a **platform** (OSM
      `railway=station`/`halt`/`platform`), with **people standing on it**; a train **pulls up** and
      people **board and alight**. Ties into trains.ts stop logic + pedestrians + a platform mesh.
- [ ] **Bot buses that stop + board** — add **AI buses** that run routes and **stop at bus stops**
      (`highway=bus_stop`, already used for street furniture), where **people get on and off**. Bus
      as a traffic agent with dwell-at-stop behaviour + pedestrian board/alight.
- [ ] **Sports grounds** — place **pitches with goals (football) / courts with hoops (basketball)**
      via the same OSM-prop pattern as fountains/benches (`leisure=pitch`), with a few **figures
      playing with a ball** on them. Instanced figures + a simple ball-and-players loop, capped.
- [x] **Glowing landmark markers** — ✅ v0.118.0: a tall translucent gold light-pillar over every
      landmark POI (`buildPoiMarkers`, instanced, over the monument point). Base for the Excursion mode.
- [ ] **Arcade mode: Excursion / Tour** — **visit the `tourism`/`historic` markers within a time
      limit**, using the **same beacon + minimap-arrow mechanism as Taxi**, just over a different set
      of points. Reuses `taxi.ts`/`taxiHud.ts` structure; a mode on the start menu.
- [ ] **Day-only / night-only drive** — a setting (or mode) to **lock the time of day**: the sky
      still breathes a little but never crosses into the other half — perpetual day, or perpetual
      night, looping. Add to the existing time-of-day setting (cycle / day / night) — clamp/loop
      `timeOfDay` within the chosen half instead of the full 0..1 cycle.
- [x] **Real weather for the city** — ✅ v0.114.0: `src/app/liveWeather.ts` (`weatherFromCode` WMO→
      Weather + `fetchCityWeather` async, keyless Open-Meteo, aborts on city-load cancel, times out at
      6s, returns null on any failure). On 'auto' the loaded city starts on its real weather via
      `startAutoAt`, guarded by a `cityGeneration` counter against a stale resolve. Tests in `liveWeather.test.ts`.
- [~] **Fuel-consumption setting + per-vehicle thirst** — per-vehicle thirst ✅ v0.116.0 (`THIRST`
      table in vehicles.ts + `thirstOf`, scaling `burn`; lorry ~1.8×, EV ~0.5×). STILL TODO: the
      **settings-menu burn-rate slider** (litres) that scales the base — needs a prefs number +
      menu slider control + wiring, layered on top of the existing on/off toggle.
- [ ] **Oncoming traffic reacts to you** — a car approaching head-on in the opposite lane can
      **flash its headlights and give a honk** as it passes (occasionally, not every time). Needs
      `traffic.ts` to spot a car closing on the player in the oncoming lane and fire a brief
      headlight-flash + a horn sound (reuse the audio bus).
- [ ] **More realistic helicopter/hover vehicle** — the hover/helicopter (🛸/🚁) should look and
      behave more like a real helicopter: a proper body + spinning main & tail rotors, nose-down tilt
      when moving, a little bob at hover. Vehicle model (`vehicle/models`) + hover physics/visual.
- [ ] **Pickable car-objects on the map** — occasionally a real, selectable vehicle sits parked on
      the map that the player can **walk/drive up to and switch into** (choose it as their car).
      Rare spawns tied to parking/roadside; reuses the vehicle roster + `selectVehicle`.
- [x] **BUG — horn dead on non-Latin keyboard layouts** — ✅ v0.113.3: all key handling matches
      `event.code` (physical position) now — horn (KeyH), neon (KeyV), zoom (Equal/Minus), help (Slash),
      and **WASD driving** (`vehicle/input.ts`, which had the same bug — WASD was dead on Cyrillic, only
      arrows worked). Pure `readInput`/`hotkeyFor` helpers, tested in `test/vehicle/input.test.ts`.
- [ ] **Flashing police lightbar** — the police car's roof beacons should **flash red/blue while
      driving** (alternating), not glow steady. Animate the shared BEACON_RED/BLUE emissive intensity
      in the loop for emergency vehicles. (Doing this myself — main.ts + parts.ts.)
- [x] **Per-vehicle horn** — ✅ v0.117.0: `HornProfile`/`HORNS` table + `hornProfile(type)` in audio.ts
      (deep air-horn for haulers, sharp parp for sports, thin beep for bikes, soft EV tone, firm
      emergency); `setVehicle` swaps it in and `horn()` plays it. Tested in `audio.test.ts`.
- [ ] **Collision knocks the OTHER guy back too** — hitting a pedestrian or bot car currently only
      bounces the PLAYER; the person/car should also be shoved/knocked back (a reaction impulse on the
      struck agent), not stand there immovable. Add a knockback to `people`/`traffic` when the player
      overlaps them at speed.
- [ ] **Underwater bubbles** — if the car sinks so the water is **above the roof**, emit **bubbles
      rising from the roof up to the surface** at the spot where you went under (they form there and
      drift up). A cheap particle stream (instanced points/quads) gated on car.y + roof < waterLevel.
- [ ] **Fly over traffic & people when airborne** — when the player is **jumped/airborne above**
      passing bot cars OR pedestrians, they shouldn't collide with them — the collision check must
      respect height (only collide when vertically overlapping), so you pass freely overhead.
- [x] **Step up onto a slightly higher surface** — ✅ v0.118.1: `resolveCircle` height-gate now skips a
      footprint the car is within `STEP_UP` (0.35m, a wheel-radius) below, so you climb a kerb/ledge/roof
      step instead of hitting a wall; the surface fn then raises the car (ROOF_SNAP). Tested in `collide.test.ts`.
- [x] **Smooth bot cornering** — v0.110.14: eased yaw toward the edge, arcs through junctions.
- [ ] **BUG — bot cars drive through each other** — traffic cars overlap and pass straight through
      one another; they should not. Add car-to-car separation in `traffic.ts` — each car checks the
      few ahead on its edge/nearby and slows/holds (or nudges) to keep a gap, so they queue instead
      of merging. Keep it O(cars) (spatial bucket or per-edge ordering), no frame-rate hit. bot cars currently **snap 90° at intersections**; make them **turn
      smoothly** (ease the heading toward the next edge / a short arc through the junction) in
      `traffic.ts`, instead of an instant rotation.
- [x] **Crowd reacts to the horn** — ✅ v0.115.0: `traffic.scatter()`/`pedestrians.scatter()` push every
      agent within ~22m radially away from the car (eased target tx/tz, clamped to MAX_KNOCK); wired to
      the horn keydown in main.ts (once per press, guarded by `car`). Parked cars aren't traffic agents.
      Tested in `traffic.test.ts` (scatters near, spares far, pushes AWAY from the source).
- [ ] **Bike lanes + cyclists** — paint a **cycle-lane stripe as a texture on the existing road
      ribbon** (no new mesh — same draw call as the road markings), and add **cyclists** riding it
      (instanced, reuse the pedestrian/traffic graph on `cycleway`/pavement). Keep it cheap.
- [ ] **Roll on a big launch** — if the car leaves a ramp/hill **hard enough** (high vertical speed /
      airtime), let it **flip/roll** per the current physics on landing; a gentle hop stays upright.
      A threshold on launch speed that permits angular tumble, otherwise keep the car damped level.
- [ ] **Bridge railings look flat/solid** — v0.110.2 seated the railings on the deck edge but they're
      a **solid-colour wall**; make them read as real railings — **posts at intervals + a top rail (and
      maybe a mid rail), with gaps between**, not a filled parapet. Instanced/merged posts+rails in
      `bridgeMesh.ts`, keep it cheap.
- [~] **Bridge pillars: off the road + solid** — collidable ✅ v0.117.1: `pierFootprints` (bridgeMesh.ts)
      + piers stashed on `group.userData.piers`; main.ts adds them to the collision grid capped at the
      deck underside (height-gated: solid to the road below, drivable on the deck above). STILL TODO:
      **offset piers off the carriageway** of a road running underneath (the visual/placement half).
- [ ] **Landmark plaque + statue placement** — the landmark **sign should sit BESIDE the monument,
      not inside it** (offset the poiMarker from the statue prop), and the **monument must not stand
      inside a tree** (place statues clear of greenery — a small placement collision check against
      trees/greenery). Touches poiMarkers offset + prop placement in the world build.
- [ ] **Manhole detail + open covers** — add **four small fixings around the rim** (like real cast
      covers), and make **some covers sit ajar / offset** as if not fully closed. Driving over an open
      one **drops the wheel in and tilts the car** — a physics dip at that spot (per-wheel height /
      a brief suspension pothole), not just a visual. Keep it cheap (instanced covers already).
- [ ] **BUG — lit windows sink into the ground** — building facade windows sometimes extend below the
      terrain (glowing windows in the dirt). On sloping ground a building's facade grid is laid from a
      fixed base; clamp/raise the lowest window row to stay above the ground under that wall (or seat
      the facade on the max terrain height along the footprint). `facades.ts`/building facade build.
- [ ] **Signage text** — real **labels on building nameplates, monuments and signposts** (street
      names, POI names, monument names from OSM). Rendered text (canvas-texture atlas or SDF) on the
      existing sign/nameplate meshes; cap how many render at once and fade by distance for cost.
- [ ] **Minimap zoom buttons** — **+ / − buttons on the minimap** to zoom it in/out, working with
      **touch** (pointer events, not just mouse) for mobile. Adjust the minimap's world-to-pixel
      scale; persist the level via prefs.
- [ ] **Taxi (and other modes) in the ⚙ side menu** — the deliver-a-fare / taxi mode is on the start
      menu but NOT in the in-game settings menu; the user expects it there too. Make the settings-menu
      modes a **single-select** (they're mutually exclusive — free/trial/race/taxi), and add taxi.
      (This is the long-standing "settings-menu modes → dropdown + add taxi" item; may pair with the
      broader menu regrouping brainstorm.)
- [ ] **People use doors** — pedestrians currently pop out through walls anywhere on a building.
      They should **enter and leave only through a door**, and the **door should open as they pass
      and close behind them**. Needs a door position per building (a facade feature already exists —
      reuse the door placement), spawn/despawn pedestrians at that point, and a small open/close
      hinge animation triggered when a pedestrian crosses the threshold.

## 🍂 Seasonal & calendar theming — planned 2026-07-19
A coherent, mostly-free theme: the world dresses for the season and the date. Almost every item is a
**material/colour swap on an existing instanced mesh** (no new draw calls) or a **date condition on
an effect we already have** — so it satisfies "must not cost frame rate" by construction.

**Seasonal (driven by date + latitude):**
- [ ] **Grass & parks by season** — season.ts (v0.110.21) already exposes `season(date,lat).grass`;
      just tint `ground.ts` park vertices toward it instead of the fixed GREEN (needs lat passed to
      buildGround — a small main.ts + ground.ts wiring). Tree crowns are DONE (v0.110.21).
- [ ] **Tree crowns by season** (already instanced) — spring: a few blossoming white/pink deciduous
      crowns; summer green; autumn yellow-orange-red; winter bare / snow-dusted. A material tint on
      the existing draw call.
- [ ] **Snow cover on roofs/ground** in the cold season for northern cities — reuse the existing snow
      shader, switched on by **calendar** by default (not only the weather toggle).
- [ ] **Pedestrian clothing by season** — the crowd already varies (skirts shipped). Seasonal
      palettes/sets: winter coats/hats/scarves; summer shorts/tees/sun-hats; rain → an optional
      umbrella prop for the high tier. Texture/colour swap on the existing instanced people, no
      physics change.
- [ ] **Fields/farms by season** (where the livestock graze) — brown in winter, green in summer; a
      material swap.

**Calendar one-offs (date condition + existing assets):**
- [ ] **New Year fireworks** — the lap-finish fireworks already exist; also trigger them on New
      Year's night, including over the start screen.
- [ ] **Halloween pumpkins** at entrances — same instancing pattern as the POI signs.
- [ ] **Spring sakura** in southern latitudes — blossoming crowns (folds into tree-crowns-by-season).

## 🧭 Big features — planned 2026-07-18 (session batch)
Five features asked for in one session. Being brainstormed + specced together, then
built as a swarm and released one-by-one. Design docs land in `docs/superpowers/specs/`.

- [ ] **1. Keep the car on the map (world edge)** — DESIGN LOCKED. Circle boundary
      R≈950 built against a `WorldBounds` abstraction (polygon-ready, real OSM admin
      boundaries a later drop-in). Soft radial braking past 900m + hard backstop at 950m,
      applied after `stepCar` (physics stays pure). A **mist-wall** curtain (`mistWall.ts`,
      one inward-facing cylinder shell at ~955m, vertical alpha fade, colour tracks
      `scene.fog`) hides the ground edge and the road stubs that spill past it — because
      the always-on fog is CAMERA-relative and never hides the edge you drive TOWARD
      (the boats lesson). Ships as a minor bump.
- [ ] **2. Offline city packs + distribution** — STRATEGIC, phased. Now: PWA (service
      worker for the app shell) + on-demand offline cache of a city's OSM (already in
      IndexedDB) and terrain tiles, with a "download for offline" action over the random
      list. Later, separate decomposition: native wrapper (Electron/Tauri/Capacitor),
      Steam, mobile. NB licensing — redistributing OSM-derived data in a store build is
      ODbL (attribution + share-alike); on-demand cache is the user's own copy and sidesteps it.
- [x] **3. Start menu + splash** — v0.98.0: branded start screen (RACE THE CITY) with Play,
      city search + 🎲 random, a vehicle strip (+ full roster) and mode (Free/Trial/Race), plus
      Continue for a saved session, over a **live autopilot city** backdrop. New `attract` state
      in main.ts suppresses driving input + forces autopilot; `src/ui/startMenu.ts` is the overlay.
      The shell the modes (#5) and replay (#4) will hang off.
- [x] **4. Trip recording + re-play** — v0.100.0: pose-based record (a REC button) + playback
      (Replay), the camera following, robust to the sim's randomness. `src/app/replay.ts`
      (recorder/player, unit-tested) + `src/ui/replayControls.ts`; the loop retraces the clip in
      place of `stepCar` while playing. Cleared on city change. (In-memory for now, not IndexedDB.)
- [x] **5. Arcade modes (A→B)** — v0.99.0: **Taxi** mode. Pick up at a glowing green marker,
      deliver to an amber marker before the meter runs out, chaining fares with a climbing score.
      `src/app/taxi.ts` (state machine + beacon) + `src/ui/taxiHud.ts`, a mode on the start menu,
      markers on the minimap. Reuses road vertices for on-road A/B.

- [ ] **6. LAN multiplayer** — drive the same city with friends on the local network (asked
      2026-07-18). Architecturally significant: the game is "no backend, static, browser-only", so
      true networking needs SOME transport (WebRTC P2P + signaling, or an optional local companion
      server). Being brainstormed — see `docs/superpowers/specs/`.

## 🗺 World & map
- [x] Sea / coastline (approximate flat-plane sea for coastal areas) — done in v0.14.0
- [x] Parks, greenery, trees (`leisure=park`, `natural=wood`, `landuse=grass`) — done in v0.13.0
- [x] **Palms in southern cities, not firs** — tree kind follows latitude; the Mediterranean band
      mixes palms with broadleaf — done in v0.65.0
- [x] **Big rivers** — water multipolygon relations, outer rings stitched by node id — done in
      v0.70.0 (verified against live Overpass: 6 water relations around the centre of Saint
      Petersburg, incl. the Neva at 490 members, none of which arrived before)
- [ ] Island holes in water — relation `inner` rings are skipped, so an island in a river is
      painted over
- [x] **Parking, marked out** — `amenity=parking` tarmac with painted bays — done in v0.68.0
- [ ] Pedestrian squares (`highway=pedestrian`)
- [x] **Flowerbeds, fountains and statues** — from `amenity=fountain`, `historic=memorial|monument`,
      `tourism=artwork`, `landuse=flowerbed`; one instanced draw per kind — done in v0.73.0
- [x] Railways, bridges, tunnels — done in v0.15.0 (bridges are decorative raised decks; you still drive on terrain)
- [x] **Drivable bridges** — profiled decks that meet the ground at both ends, with railings and
      piers; markings and lamps ride the deck — done in v0.69.0
- [ ] **Name the rivers** — `roadLabels` only labels roads; a bridge is worth crossing when you
      can see what it crosses. Waiting on relation-mapped rivers arriving at all (above).
- [ ] **Bridge road labels sit on the terrain** — `roadLabels.setWorld` still reads the ground
      provider, so a bridge's name floats under its deck.
- [x] **Manhole covers** on the roads — scattered procedurally along road centrelines (like the
      nitro spots), not from OSM's patchy `man_made=manhole` — one instanced draw, dark iron
      discs, deduped at junctions, skipping bridge/tunnel decks — v0.95.0
- [x] **Buildings read by type** — windows, doors and signage from the OSM classification —
      done in v0.66.0
- [ ] Roof shapes; better height heuristics
- [ ] Larger area / stream neighbouring tiles as you drive
- [x] POI markers (cafés, fuel) from OSM — signpost with a coloured panel + glowing glyph
      (café brown, fuel green), instanced per kind, neon-styled — v0.97.0
- [x] Sky dome with gradient + sun disc — done in v0.33.0
- [x] Street lamps, signs & road markings — done in v0.31.0, reworked in v0.37.0

## 📥 Asked for, not done yet
- [ ] **Birds are still wrong, and the model is worse than the motion** (reported after
      v0.91.1 — check the user was on it before diagnosing):
      - **[MODEL DONE v0.93.0]** the flat "two triangles, no body" is fixed: a low-poly
        octahedron **body** (`bodyGeometry`) now rides under the flapping wings, third
        InstancedMesh, symmetric so heading's z-sign doesn't matter. The two below remain.
      - "висят неподвижно на уровне деревьев" — a perched bird is motionless at TREE_PERCH_H
        over a tree's ground position, but the trees it perches on are scaled 0.7-1.4, so the
        height is a guess and the bird reads as hanging in the air beside one, not sitting in
        it. Perches need the tree's actual crown, or to stop pretending: `world.trees` gives
        positions only, and `buildTrees` scales each one after the fact
      - "отвесно падают вниз на землю и исчезают" — something still drops vertically. The
        landing flies a glide slope now, so suspect the takeoff→perch path or the FAR recycle
        (`b.state = 'perched'` snaps a bird to a fresh perch with no transition at all —
        that IS a teleport, and next to the player it would be seen)
      - **"выглядят они плоско, это отвратительно"** — they ARE flat: two triangles hinged at
        a shared vertex, no body at all. A bird needs volume: a body, and wings that read as
        wings from the side. This is the part to fix first — the motion is closer than the
        model is
- [x] **Coming off a height reads as falling through it** — off a roof, and off the end of a
      high bridge, the car reaches the edge and drops rather than launching off it — v0.94.0:
      a downward step past `LEDGE_DROP` (1m) now makes the car airborne at the lip, carrying
      horizontal speed into an arc instead of snapping down to the street
- [ ] **Trees want more variety in height** — today every tree is scaled 0.7-1.4 of one
      model per variant, which reads as uniform; the variants themselves are all much of a
      size (conifer 3.7, broadleaf 3.6, spruce 4.4)
- [ ] **Keep the car on the map** — nothing stops you driving off the ground mesh (RADIUS
      1000m from the middle) into empty space
- [ ] **The moon does not read at night** — one exists (v0.68.2): a shader disc riding
      opposite the sun in `sky.ts`, `smoothstep(0.9975, 0.9987)` wide with a `pow(md, 900)`
      glow. Asked for again, so it is not landing — probably too small, too dim, or lost to
      the fog. Wants a look before any code
- [ ] **Elevation is exaggerated in some cities** — Helsinki, St Petersburg and Tokyo have far
      bigger swings than they should (Helsinki and SPb are flat in life); other cities look
      right.
      - **[MEASURED — the cos(lat) suspect is REFUTED.]** `test/terrain/elevationGeometry.test.ts`
        runs the real projector + tile-pixel mapping: a local 500m step spans exactly 500.0m of
        real ground at 0°, 35°, 51° and 60°N. The projector's `cos(lat0)` longitude scale
        cancels through the Mercator tile sampling, so slopes are geometrically EXACT at every
        latitude — a ×cos "fix" would have broken correct geometry. Terrarium heights decode by
        the standard formula and sample bilinearly, so the vertical is right too.
      - **Still open, next probe:** the exaggeration must therefore be in the DEM SOURCE values
        (Terrarium artifacts — z14 relief, DSM-vs-DTM, noise over water) or perception (low-poly
        flat-shading dramatising real relief). Next: a real-city HEADLESS fetch comparing
        `heightAt`'s range over the map against known ground truth for SPb/Helsinki, to tell a
        source problem from a look problem before touching anything.
- [ ] **More cities** — the random list repeats too often (85 across 10 regions today; a
      region is drawn first, so small regions come up disproportionately)
- [x] **Trains come out of a tunnel and go into one** — carriages off the line are no longer
      clamped onto its first metre, so they stop piling up and driving out of each other, and
      each line ends in a mouth instead of in mid-air — v0.88.0
- [x] **Birds** in the sky — a flock wheeling round a centre that follows you — v0.90.0
- [x] **Yachts and sailing boats**, and more boats where a city has plenty of water — the
      vessel follows the room available, and every stretch of water gets one before any gets
      a second — v0.91.0
- [ ] **Emergency vehicles** — a fire engine, a police car and an ambulance (livery, light bar;
      the shared light materials in `models/parts.ts` are driven per frame, see AGENTS.md)
- [x] **A jeep** — an off-roader: heavier and less eager than the car, 4x4 grip, and a top
      speed that stays high instead of falling off like the truck's — v0.91.0
- [x] **Petrol cans** to pick up, in the nitro's style; run low on fuel and the car slows — the
      pickup engine is shared with the nitro rather than copied — v0.89.0
- [ ] **People walk through trains** — they should wait at the crossing and let them pass
- [x] **Benches, empty and with people sitting on them; bus stops** — from OSM `amenity=bench`
      and `highway=bus_stop`; instanced benches (~2 in 5 with a blocky seated figure) and
      two-post bus shelters, neon-styled with the road furniture — v0.96.0
- [ ] **A couple more languages** (localization) — the i18n table (`src/i18n/i18n.ts`) ships
      English + Russian today; add ~2 more (e.g. Spanish, German — or French/Chinese) by
      translating the string map. Menu already has the language switch; the work is the copy.
- [x] **Fly over anything you are above** — the physics grid carries each obstacle's roof
      height now, so a jump clears a bungalow, a fountain or a statue instead of being
      cancelled in mid-air by ground the car is nowhere near — v0.86.0
- [x] **Land on a roof and drive along it** — the roof is ground when you are above it, the
      same rule bridges have used all along — v0.87.0
- [x] **Girls in skirts** among the pedestrians — shipped inside v0.87.0 (its message does not
      mention them: they were swept into that commit by mistake)
- [x] **Markings float above the car on a bridge** — a bridge running under a flyover was told
      its own deck was the flyover's: the deck index answered with the highest deck there was,
      so the markings went up there and the car fell through to the ground — v0.90.1
- [ ] **Map radius ×1.5** (1000m → 1500m) if it does not cost performance — measure first:
      buildings are merged per class, so nothing is culled and 2.25× the area is 2.25× the
      vertices, whatever the fog hides
- [ ] **Sandy ground in southern cities** — green reads wrong for Cairo or Marrakesh. Latitude
      alone cannot decide it: Bangkok and Hong Kong are hotter and lush. Green share does not
      either — measured live, Cairo is 5.8% green and Barcelona 4.8%. Needs a real signal
      (`natural=sand|desert|bare_rock` from OSM is the obvious one)

## 🚗 Vehicles & physics
- [x] More vehicles — six more incl. a leaning motorbike — done in v0.51.0 (custom colours still open)
- [x] **Ten more vehicles** — crane, minivan, tracked ATV, hovercar, EV, retro, tanker, tiller,
      roller, combine — done in v0.58.0 (19 types total)
- [x] **Grouped, collapsible vehicle picker** (4 groups by purpose) — done in v0.58.0
- [x] **Nitro: flame from the exhaust** — pinned to the mesh's rear bbox face, so every
      vehicle gets one in the right place — done in v0.64.0
- [x] **`lens` and `housingBar` now take `w, h` in the same order** — the mismatch that shipped
      two 1.5m-tall "light bars" in v0.58.0 — done in v0.68.1
- [x] **Steered wheels turn with the input** — tagged per vehicle, since a combine steers on its
      rear and a tracked hull on neither — done in v0.62.0
- [x] **Tiller pulls a trailer** and the driver rides it — done in v0.62.0
- [ ] Custom vehicle colours
- [x] **Jumps** — gravity, `vy`, and a takeoff when the ground drops out from under you —
      done in v0.71.0
- [x] Brake tuning — turned out to be already fixed: the step clamps at zero. Closed with a test
      that brakes from a range of speeds and step sizes and asserts it never reverses — v0.71.1
- [x] Drift effects — tyre skid marks + smoke — done in v0.16.0 (2x longer trail in v0.38.0)
- [ ] Damage / dents, collision bounce with impulse
- [x] Headlights (glow + spotlight that brightens at night) — done in v0.19.0
- [x] Speedometer / HUD (km/h) — done in v0.20.0, gauge in v0.25.0, odometer + km/miles in v0.56.0
- [x] Turn signals + per-vehicle tail lights — done in v0.32.0, fender repeaters in v0.40.0
- [x] Visible glass on enclosed vehicles — done in v0.54.0

## 🏁 Gameplay modes
- [x] **Demo / autopilot mode** (menu toggle) — done in v0.72.0. Built the road graph it needed
      (`src/world/roadGraph.ts`), which traffic and pedestrians can now use too.
- [x] Time trial — gates, lap clock, best lap kept in localStorage — done in v0.77.0
- [x] **Races with rivals** — three AI cars race the gate course, each on an A* route over the
      road graph, driven through the same physics as the player; HUD shows your place — v0.83.0
- [x] Fireworks when you finish a lap — v0.83.0
- [x] **Goals and missions** — pick up a passenger, deliver them inside a time limit — Taxi mode,
      v0.99.0 (see the big-features #5 entry)
- [ ] Rivals and traffic as solid obstacles (today you drive through both)
- [x] Free objectives — nitro speed-boost pickups scattered on roads — done in v0.45.0
      (drive-to-a-point / coins still open)
- [x] Traffic — AI cars walking the road graph, kept around the player — done in v0.75.0
- [x] Pedestrians (ambience) — walking the pavements, incl. footways cars can't use — done in v0.75.0
- [x] **Livestock in the fields** — cows, goats and pigs on farmland/meadow — done in v0.76.0
- [x] **Aircraft crossing the sky** — airliner, bizjet, turboprop and helicopter, each with its
      own height, speed and silhouette — v0.74.0, varied in v0.78.0
- [x] **Trains on the rails** — freight, intercity and commuter, running the OSM railway
      polylines — done in v0.74.0
- [x] **Boats on the big water** — a ship where there's room for one, a rowing boat where there
      isn't — sized by the water's inradius, not its area — done in v0.76.0

## 🎨 Visuals & atmosphere
- [x] Weather (rain/snow/fog, menu option) — done in v0.26.0, auto-cycling in v0.42.0, snow tweak v0.45.1
- [x] Street lights at night — lamps, fixtures & light pools — done in v0.31.0, reworked v0.37.0
- [x] **Glowing building windows at night** — emissive facade map, driven by the same night
      factor as the street lamps — done in v0.66.0
- [x] Shadows (sun shadow map, car-following frustum, menu toggle) — done in v0.23.0
- [x] Sky dome with gradient + sun disc — done in v0.33.0
- [x] **Stars at night** — hashed from the view direction in the sky shader, no new objects or
      draw calls — v0.60.0; sized up to actually be visible, plus a moon — v0.68.2
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
- [x] Horn (hold H) and checkpoint chime — done in v0.77.0
- [ ] Indicator tick
- [ ] Positional audio (engine quieter as camera pulls back)

## 🖥 UI / UX
- [x] **Speedometer sized to match the minimap** — done in v0.67.0
- [ ] Full-screen map on a key; minimap zoom
- [x] **Pause button next to the ⚙ button** (Escape too) — done in v0.63.0
- [x] Controls help overlay (? button, or the ? key) — done in v0.80.0
- [x] Shareable link with the city in the URL (`?city=…`) — done in v0.41.0
- [x] Save position / session (city + car pose) — done in v0.48.0
- [x] Camera zoom slider — done in v0.39.0; auto pull-in near buildings v0.53.0, in tunnels v0.47.0
- [x] Random-city button — done in v0.43.0
- [x] Collapsible menu groups + reset-location button — done in v0.57.0
- [x] Notify when a new version is deployed — done in v0.50.0
- [x] **Update notice: dismiss sticks** — done in v0.65.2 (untested: no jsdom in the suite,
      which runs in node; not worth a devDependency for three lines)

## ⚙️ Data & performance
- [ ] Overpass caching proxy (if we hit rate limits — designed for)
- [x] **Batch buildings** — merged into one mesh per class; ~470 draw calls for central
      St Petersburg became a handful — done in v0.79.0 (merging, not instancing: every
      building is a different shape)
- [ ] Web Worker for parsing / mesh building (no frame hitch on load)
- [x] Loading progress bar with percentages — done in v0.44.0
- [x] Low/normal/high rendering modes — done in v0.52.0
- [x] Shader/GPU warm-up during load (kills startup stutter) — done in v0.46.0
- [x] Retry flaky city loads up to 3 times — done in v0.56.1

## 🧹 Tech debt / polish
- [x] Update Actions node (22) — v0.25.0
- [x] Split the bundle (three vendor chunk) — v0.25.0
- [x] **Boot check** — `npm run boot-check` runs the built app in headless Chrome and fails if it
      doesn't start. Added after v0.82.0 shipped a black screen past clean types, 362 green tests
      and a clean build — none of which load main.ts — done in v0.82.2
- [ ] E2E test of a real city load (boot-check covers startup, but not a real Overpass fetch)
- [ ] Run boot-check in CI, so a dead build can't be deployed
- [x] Early-review nits (parse naming, cache db.close) — v0.25.0
