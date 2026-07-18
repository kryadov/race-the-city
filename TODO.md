# TODO / Ideas

Backlog of ideas for Race the City. Shipped features live in the git tags / releases
(v0.1.0 … current); this file tracks what's next.

## 🎮 Play-test backlog — 2026-07-19 (live session)
Asked during a play-test; deferred here so they aren't lost. Ship order: bugs first, then polish.

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
- [ ] **Colour-coded nitro** — nitro bottles come in **different colours**, and the colour sets the
      boost: a **different acceleration effect and/or a different duration** per colour (e.g. a short
      hard punch vs a long gentle push). Needs a small table of nitro types (colour → boost strength
      → duration), the pickup mesh tinted per type, and `car`/boost logic reading the type it grabbed.
- [ ] **Living parking lots** — parking areas should hold **a few parked cars of varied type and
      colour** (not packed — enough to read as a car park), and cars should **drive in, park, sit,
      then drive out** again. Reuse `world.parking` polygons + the vehicle roster; a small occupancy
      state machine (arrive → parked dwell → depart) feeding off the traffic graph for approach/exit.
- [ ] **People get in and out of cars** — a pedestrian can walk up to a (parked) car, get in and the
      car drives off; and an arriving car can drop one off. Pairs with living parking lots and the
      taxi passenger figures already in `taxi.ts`.
- [ ] **Arcade mode: Police / Robber (tag)** — a mode where you're **either the police (goal: touch
      the runner) or the runner (goal: avoid being touched)**. AI drives the other role on the road
      graph; win/lose on contact or a timer. Slots into the start-menu mode list + `applyTrial`/
      `applyTaxi`-style wiring, reusing rivals/traffic AI for the opponent.
- [ ] **Level-crossing barriers** — drop **boom barriers (шлагбаумы) at railway crossings** that
      lower when a train approaches and raise after it passes. Reuse `trains.ts` timing + the road/rail
      intersection points; a hinged bar mesh + a simple down/up animation gated on train proximity.
- [ ] **Sports grounds** — place **pitches with goals (football) / courts with hoops (basketball)**
      via the same OSM-prop pattern as fountains/benches (`leisure=pitch`), with a few **figures
      playing with a ball** on them. Instanced figures + a simple ball-and-players loop, capped.
- [ ] **Glowing landmark markers** — a **lit beacon over `tourism`/`historic` POIs**, exactly like
      the cafe/fuel markers already do (`buildPoiMarkers`). Ships on its own AND is the base for:
- [ ] **Arcade mode: Excursion / Tour** — **visit the `tourism`/`historic` markers within a time
      limit**, using the **same beacon + minimap-arrow mechanism as Taxi**, just over a different set
      of points. Reuses `taxi.ts`/`taxiHud.ts` structure; a mode on the start menu.
- [ ] **Real weather for the city** — pull the **current weather at the loaded city's lat/lon from a
      free, keyless service** (Open-Meteo is CORS-friendly, no API key) and if it's raining there,
      rain in-game. Hard constraints: **fully async, never blocks the load or a frame**, and **falls
      back to the default** weather if the fetch fails or is slow. We already have lat/lon from
      geocode and a rain weather state; just gate the initial weather on the fetch result.
- [ ] **Fuel-consumption setting + per-vehicle thirst** — a settings-menu **slider for fuel burn
      rate (in litres)**, and each vehicle type has its **own base consumption** (a lorry drinks more
      than a sports car). The slider scales the base. Wire into the existing fuel/HUD (`fuel`,
      `hud.ts` fuel bar) and the vehicle spec table; persist via prefs like the other settings.
- [ ] **Oncoming traffic reacts to you** — a car approaching head-on in the opposite lane can
      **flash its headlights and give a honk** as it passes (occasionally, not every time). Needs
      `traffic.ts` to spot a car closing on the player in the oncoming lane and fire a brief
      headlight-flash + a horn sound (reuse the audio bus).
- [ ] **Pickable car-objects on the map** — occasionally a real, selectable vehicle sits parked on
      the map that the player can **walk/drive up to and switch into** (choose it as their car).
      Rare spawns tied to parking/roadside; reuses the vehicle roster + `selectVehicle`.
- [ ] **BUG — horn dead on non-Latin keyboard layouts** — the klaxon key is matched on `event.key`,
      which changes with the layout, so on a Russian (or other) layout it never fires. Match the
      **physical key via `event.code`** for the horn (and audit the other driving keys the same way)
      so the bound key works regardless of layout.
- [ ] **Crowd reacts to the horn** — honking makes **nearby pedestrians and cars veer away** from the
      player — but **not parked ones**. A brief repulsion impulse on `people`/`traffic` agents within
      a radius when the horn fires; parked/stationary cars ignore it.
- [ ] **Bike lanes + cyclists** — paint a **cycle-lane stripe as a texture on the existing road
      ribbon** (no new mesh — same draw call as the road markings), and add **cyclists** riding it
      (instanced, reuse the pedestrian/traffic graph on `cycleway`/pavement). Keep it cheap.
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
- [ ] **Grass & parks by season** — spring bright green, summer saturated, autumn ochre/rust/brown,
      winter grey-green or snowy (northern latitudes, synced with the existing snow logic).
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
