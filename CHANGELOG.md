# Changelog

Every version is a deployed build and a GitHub Release. Newest first. 👀 = what to look for when
you play-test that version.

> Keep this current: every release adds an entry here in the same change as the version bump
> (see AGENTS.md). The recent entries carry a "what to look for" so a new feature is easy to find.

## v0.129.0 — flip the car on a big launch
- Kick off a ramp **hard enough** and the car now **flips through the air** — a forward roll that
  keeps turning while you're airborne and then **rights itself to the nearest whole turn on landing**,
  so however it tumbled it comes down on its wheels. A **gentle hop stays level** as before: only a
  launch well past the ordinary crest-of-a-bridge kick tips you over, so kerbs and arches don't spin
  you. Purely a look — it doesn't change where you land. Hovercraft never flip (they float level).
- 👀 Find a good ramp or a high bridge end, get up some speed, and launch — the car should barrel over
  and touch down upright. A small bump should NOT flip you.

## v0.128.0 — traffic obeys the lights; bridge piers off the carriageway
- **Traffic lights** now mean something: bot **cars hold at a red** (coasting to a stop line just back
  from the junction) and **go on green**, reading the very phase that lights the lamps. It can't
  gridlock — every junction is green for part of every cycle (the phase runs on a clock, never on the
  traffic), and a car held too long proceeds anyway as a fail-safe. O(1) per car. (Pedestrians still
  cross freely — cars only, for now.)
- **Bridge piers** are now a **pair set toward the deck edges** instead of one on the centreline, so a
  pier no longer plants itself in the middle of a road running UNDER the bridge (piers became solid in
  v0.117.1) — the centre bay stays clear to drive through.
- 👀 Watch bot cars stop at reds and pull away on green; drive the road under a viaduct — the piers are off to the sides.

## v0.127.0 — drive through the buildings a road runs into (archways)
- Where an OSM road or railway runs straight through a building, the car and bots used to hit an
  invisible wall — the road vanished into masonry. The building's collision is now **carved open along
  the road corridor** (the road is genuinely drivable through; the rest of the building stays solid),
  and a **stone archway** stands over the passage so it reads as the building bridging the road. The
  fix reaches the player and the grid-driven bots (the chase cops, the race rivals) alike.
- Known limit / follow-up: the building's *visual* wall still spans the opening for now (dressed by the
  arch frame); physically cutting the extruded mesh (CSG) is a follow-up. Safe by construction — a
  building too small to carve is kept solid rather than opened wholesale.
- 👀 Find a road that dives into a building — you can now drive through it, under a stone arch, instead
  of stopping dead in the wall.

## v0.126.0 — sports pitches and cycle lanes
- **Sports grounds** — OSM `leisure=pitch` fields now render as a marked green pitch: a white outline
  and centre line (a centre circle for football/basketball), **goals** at each end, or a **basketball
  hoop** where the sport says so, plus a few players with a ball. Capped, clipped, neon-aware.
- **Cycle lanes** — roads with a cycle lane (`highway=cycleway` or a `cycleway=*` tag) get a terracotta
  **lane stripe** painted along them, riding the existing road-markings layer (no extra draw call).
- ⚠️ Adding pitches to the map query changes the OSM cache key, so **every city re-downloads once** on
  its next load (a one-time cost — cached offline again afterwards). Nothing else about the data changed.
- 👀 Find a park pitch (football goals / basketball hoop + a ball and players); look for the terracotta
  cycle-lane stripe on bike routes.

## v0.125.0 — Cops & Robbers chase mode
- A new mode (**🚓** on the mode picker): two AI police cars hunt you down, re-routing to your live
  position through the streets. **Evade** them for 50s to escape (score +1); get within ~9m of a cop
  and you're **busted** — either way a fresh round spawns the cops far off and the chase resumes. The
  cops drive real physics on the road graph (like the rivals), capped just under a sports car so a
  sharp driver can lose them. The HUD shows the timer, the distance to the nearest cop (a warning when
  close), and your escapes; the minimap arrow points at the nearest cop so you can flee the other way.
- 👀 Menu → **🚓 Cops & Robbers** → Play. Outrun the police for the timer — a fast car and tight corners help.

## v0.124.0 — the combine mows the fields
- Drive the **🌾 combine harvester** over a **farmland** field and it now cuts a swathe: the standing
  gold crop shrinks to **stubble** where you pass, and every so often a **hay bale** is left behind in
  the cut strip. Any other vehicle leaves the crop standing — the mowing update costs nothing unless
  you're actually in the combine. The crop is a capped, field-clipped scatter of stalks over a coarse
  mown grid; bales are capped too; it resets with each new city and glows in neon like the rest of the world.
- 👀 Pick the **🌾 combine**, find a farmland field, and drive across it — a cut strip of stubble follows
  you, with the odd round bale.

## v0.123.0 — people get in and out of the parking cars
- The living car-park cars (v0.122.0) now have someone getting in and out: when a car has just
  arrived and parked, a figure steps out and walks off toward the kerb; before a car leaves, a figure
  walks up from the kerb and boards, and the car pulls away occupied. The walker stays on a short
  straight path between the bay and a point inside the lot, so it never clips a building. Bounded to
  the same handful of animated cars, neon-aware.
- 👀 Watch a car in a lot: someone walks up and gets in before it drives off, and steps out when one arrives.

## v0.122.0 — living car parks
- Car parks aren't frozen showrooms any more: a few cars in each lot come alive — they sit parked,
  pull slowly out of their bay and fade away at the lot's mouth, and after a beat a car fades back in
  and drives to a bay. All motion stays strictly **inside the lot polygon** (a straight run between a
  bay and the lot's exit point, both verified inside), so a car can never drive into a building. The
  bulk of each lot stays static; this is a small **capped** pool (≤12 across the map, ≤2 per lot) of
  individual cars, neon-aware, coming and going on their own timers.
- 👀 Drive through a car park and watch a while — a few cars pull out and drive off, others arrive and park.

## v0.121.0 — Excursion mode: tour the city's sights
- A new game mode (**🗺** on the menu's mode picker): drive to each of the city's **landmarks**
  (museums, monuments, memorials, castles, viewpoints) before the clock runs out, then on to the
  next-nearest — your count of sights climbs with every one reached. A single tall **gold beam**
  stands over the CURRENT sight (the minimap arrow points at it too), so there's exactly one beacon
  to chase — the beacon idea from v0.118.0 done right, one at a time rather than a pillar over every
  landmark. Targets stay on the map (same reach-bound as taxi fares). Reuses the taxi structure.
- 👀 Menu → pick **🗺 Excursion** → Play. Follow the gold beam / minimap arrow to each sight before the timer.

## v0.120.0 — About & Support on the main menu
- The **About** section is now a top-level entry on the main menu screen — an **ℹ️ About** button
  beside ⚙ Options — instead of being buried inside Options. It opens its own panel: a short note on
  what the game is and who makes it, plus a **❤️ Support** link to GitHub Sponsors.
- 👀 Open the menu → **ℹ️ About** on the main screen → a panel with the **❤️ Support** button.

## v0.119.1 — two fixes: no beacon spam, and fares stay on the map
- **Removed the landmark beacons** (v0.118.0). A gold light-pillar over *every* tourist/historic POI
  turned dense cities into a forest of columns, some standing right through a monument. Landmarks keep
  their signpost; the beam belongs to a future tour/excursion mode (one over the *active* target, like
  the taxi beam) — not a permanent pillar over all of them.
- **Taxi fares and time-trial gates no longer spawn past the map edge.** They were drawn from all road
  vertices, some of which run off the ±RADIUS ground, so a pickup or gate could sit out where you brake
  at the world edge and can never reach it. Both now filter to a drivable half-extent well inside the
  edge (taxi `reset` + `pickCourse` take a `bound`); the other must-reach spawners were audited too.
- 👀 No gold pillars littering the city; every taxi fare and time-trial gate is reachable.

## v0.119.0 — a fuel burn-rate control
- The **⚙ Options** fuel button is now a cycle: **Off → ×0.5 (eco) → ×1 (normal) → ×1.6 (thirsty)**.
  It scales the per-vehicle burn from v0.116.0, so you can make a tank last a long cruise or run it
  down fast, and it's remembered between sessions. **Off** still means the tank never drains.
- 👀 ⚙ Options → tap **Fuel** to cycle the rate (×0.5 / ×1 / ×1.6) — the gauge then drains at that pace.

## v0.118.2 — no more statues buried in a tree
- A monument could stand inside a tree when OSM put a `natural=tree` point right on a landmark — the
  sight vanished into a canopy. Greenery now drops any tree (scatter or forest fill) within a few
  metres of a statue / fountain / prop, so monuments stand clear. (Its plaque already stepped aside
  from the monument; this clears the greenery around it too.)
- 👀 Find a monument under a landmark beacon — it stands in the open now, not poking out of a bush.

## v0.118.1 — drive up a low kerb instead of hitting a wall
- A surface only a wheel-radius (0.35 m) higher than the car — a kerb, a low ledge, the next step of
  a terraced roof — used to be a hard wall that stopped you dead. The collision now lets you climb up
  onto anything within a step of your own height (it was already height-gated for flying OVER a roof;
  this extends the same idea downward by one step). A wall taller than a step still stops you.
- 👀 Nose the car at a low kerb or ledge — you ride up onto it now instead of bouncing off.

## v0.118.0 — landmarks get a beacon
- Tourist and historic sights (museums, monuments, memorials, castles, viewpoints…) now stand under
  a tall, soft **pillar of gold light**, like the taxi beam, so you can spot a landmark from across
  the city — over the monument itself, with its plaque beside it. One instanced draw for all of them,
  capped and unculled. Also the groundwork for a future tour/excursion mode.
- 👀 Scan the skyline for gold light-pillars — drive to one and there's a sight at its foot.

## v0.117.1 — bridge pillars are solid now
- Bridge support piers were drawn but had no collision, so a car (or bot) on the road **under** a
  bridge drove straight through the pillars. Each pier is now a solid footprint in the collision grid,
  **capped at the deck underside** — it stops you on the road below, but a car **on the deck** above
  passes over it freely (height-gated, same trick the buildings use). Piers still sit on the deck
  centreline; nudging them clear of a road that runs underneath is a separate follow-up.
- 👀 Drive the ground road beneath a viaduct — you now bump the pillars instead of ghosting through them.

## v0.117.0 — every vehicle has its own horn
- The horn was one 440/554 beep for everything. Now it sounds the vehicle: a **lorry / bus / tanker**
  blasts a deep sawtooth **air-horn**, a **sports car** parps higher and sharper, a **motorbike**
  squeaks a thin beep, an **EV / hover** gives a soft synthetic tone, and **emergency** vehicles are
  firm and insistent. Plain cars keep the classic two-tone. (A `HORNS` table keyed by vehicle,
  mirroring the engine profiles; `setVehicle` swaps it in with the engine voice.)
- 👀 Honk **H** in a lorry, then a sports car, then a bike — three different horns.

## v0.116.0 — every vehicle drinks at its own rate
- Fuel now burns per vehicle. A plain car is the reference; a laden **lorry / tanker / fire engine**
  drinks ~1.7–1.9× as fast, a **sports car** a bit more than a car, and an **EV or hover** sips
  (~0.5–0.6×). So the gauge says something about what you're driving — a truck has you hunting petrol
  cans sooner than a hatchback does. A per-vehicle `THIRST` table scales the existing burn; the
  fuel-use on/off toggle is unchanged. (A user-facing burn-rate slider is still to come.)
- 👀 With **fuel use on**, drive a lorry, then a car, the same distance — the lorry's gauge drops
  noticeably faster.

## v0.115.0 — the horn clears a path
- Honking now makes the crowd react: bot cars and pedestrians within earshot **step aside**, away
  from you, then ease back — a real use for the horn beyond the noise. It fires **once per press**
  (holding it down doesn't keep shoving), reaches ~22 m, and each agent is nudged **straight away
  from your car** (clamped, so it's a step aside, not a launch). Parked cars aren't traffic agents,
  so they stay put.
- 👀 Drive into a knot of traffic or a crowd and tap **H** — they part around you.

## v0.114.0 — the city's real weather
- On the **Auto** weather setting, a city now starts with **its actual current weather**: the game
  asks Open-Meteo (keyless, no backend of ours) what it's doing at the city's coordinates and, if
  it's raining / snowing / foggy there, so is the game — then the usual slow cycle drifts on from
  there. Fully async and best-effort: it never blocks the load or a frame, and if the request fails,
  is slow, or you change city mid-flight, the normal auto cycle just carries on. A **fixed** weather
  choice (clear/rain/snow/fog) is left exactly as you set it.
- 👀 Set weather to **Auto** and load a city whose weather you know (or a rainy one) — it should come
  up matching real life.

## v0.113.3 — keys work on any keyboard layout (WASD, horn, neon, zoom)
- The driving keys and hotkeys were matched on the **character** the key produces (`event.key`),
  so on a **Cyrillic (or AZERTY) layout WASD did nothing** — the W position yields `ц`, not `w` —
  and the **horn (H) never sounded**. They're now matched on the **physical key** (`event.code`),
  so WASD, **H** (horn), **V** (neon), **+/−** (zoom) and **?** (help) all work whatever the layout.
  The arrow keys always worked and still do. Input mapping moved into a pure, tested helper.
- 👀 On a non-English layout: WASD now drives, and **H** honks — neither did before.

## v0.113.2 — neon covers birds/aircraft/arcade pickups too; arcade never offers your own car
- Finishing v0.113.1: the last movers now flip to neon wireframe as well — the **bird flock**, the
  **aircraft**, and the **arcade car-pickups**. Neon coverage is complete for everything that moves.
- Arcade "find a car" no longer spawns a pickup of the **car you're already driving** — the roster
  re-rolls so every pickup you go for is a genuine change of vehicle.
- 👀 In neon, the flock and planes glow amber like the traffic; in arcade mode a pickup is never your
  current car.

## v0.113.1 — neon now flips the car and every bot, not just the world
- In neon view the buildings, roads and greenery went to glowing wireframe, but the **player car,
  bot traffic and pedestrians stayed solid** — daylit objects sitting in the dark neon world. Now
  every mover flips too: the **player car glows white**, and the **bots** (traffic, buses,
  motorcycles, cyclists, pedestrians, trains, boats, livestock) **glow amber wireframe**. A mover
  flags itself with `userData.neonMover`; the theme finds them live in the scene each toggle and
  re-flips after a vehicle swap or a crowd rebuild, so a car you swap into or a city you load while
  in neon comes up neon too. (Birds, aircraft and the arcade car-pickups aren't flipped yet.)
- 👀 Press **V** for neon while driving — your car is a white wireframe, the traffic/buses/bikes/
  pedestrians/trains around you glow amber; swap vehicle (arcade) or change city in neon and it stays neon.

## v0.113.0 — colour-coded nitro
- Nitro bottles used to be one blue kind with one fixed boost. They now come in three colours,
  and the colour is the boost: **blue** is the balanced standard you already knew (×10 top speed,
  2.5s), **red** is a short hard punch (×15, harder acceleration, but only 1.3s), **green** a long
  gentle push (×7, 4.6s). The whole field shows every colour at once, so you can pick your hit.
  (Under the hood the pickup engine now carries a per-bottle payload, so the bottle you grab
  reports its own type instead of a bare "collected".)
- 👀 Drive through the scattered nitro — bottles in blue/red/green; grab a **red** for a brief
  savage kick, a **green** to hold a boost a long way across the map, **blue** for the old feel.

## v0.112.0 — one unified menu, plus three world fixes
The start splash and the in-game ⚙ side menu are now **one menu**. It opens the same way at the start
and on **Esc**, keeps the branded main-screen look (city, car, a **single-select mode picker** —
Free · Time-trial · Race · Taxi · 🕹 Find-a-car — and Play/Resume/Continue), and tucks every setting
behind a **⚙ Options** screen (view, audio, map & density, language, autopilot, about). One mode model
replaces the old split where you could switch trial + race + arcade on independently. (Bundled in one
release because the menu and the three fixes below all wire through `main.ts`.)
- **Start position** — you no longer spawn staring into a wall or with a house behind you blocking the
  chase camera; the spawn vertex/heading is scored for a clear view ahead and along the camera track.
- **Ground surfaces** — farmland, meadow, orchard and residential land now render as their own ground
  tints instead of uniform grass (one merged draw, no frame cost).
- **Traffic** — bot cars stop driving **through parked cars** on a lot (they slow and hold), and now
  drive **on bridge decks** at deck height instead of under them.
- 👀 Open the menu at start or with **Esc** — one screen, a mode picker + **⚙ Options**. Then: drive a
  **bridge** (bots up there too); a **car park** (bots weave round the parked cars); **respawn** in a
  few cities (a clear view, not a wall); a **rural** map (farmland/meadow/orchard tints).

## v0.111.1 — smooth, per-vehicle tachometer (and a smaller dial)
- The tacho needle jumped like a clock: RPM was a gear-staircase that snapped to the top of each gear
  and lagged, identical for every vehicle. It's now a smooth rev model that eases toward a target set
  by the vehicle's own speed-vs-top-speed and throttle, scaled per vehicle — a truck sits low and lazy,
  a sports car spins high and eager, and a nitro overshoot just pins the redline. The dial is also
  ~1.5× smaller than the speedometer.
- 👀 Accelerate through the range — the needle glides instead of ticking; compare a truck to a sports
  car; the tacho dial is now smaller than the speedo.

## v0.111.0 — the rowboat is boat-shaped, with someone rowing
- The rowboat was a box with a cone bow. It's now a proper tapered low-poly hull — pointed at both bow
  and stern, open on top like a shell you sit in, with an upswept sheer and a keel that dips amidships —
  and a figure sits rowing it with two oars in a steady stroke. Static geometry, capped and rare.
- 👀 Find a small pond with a rowboat — a real hull with a rower pulling the oars, not a floating box.

## v0.110.63 — signpost pole no longer pokes through the sign
- On POI / landmark signposts the pole rose to the very top of the panel, and because the camera
  looks slightly down as you approach, its grey top peeked over the plate. The pole now stops down at
  the panel's lower edge, tucked wholly behind the plate, so it never shows above the sign from any
  angle. Panel, glyph and instancing are unchanged.
- 👀 Drive up to a café / fuel / landmark signpost — no pole tip peeking over the top of the sign.

## v0.110.62 — parked cars look like cars, sat on the tarmac
- Parked cars were dark boxes sunk into the tarmac, packed in one dense line. They now have four
  wheels, a glass cabin and head/tail lamp dabs, ride ON the surface (a band of tyre shows beneath),
  spread across the lot's bays, and there are fewer of them — a real, part-empty car park rather than
  a showroom crush. Still a handful of instanced draws for the whole map.
- 👀 Drive through a car park — cars with wheels and lamps, seated on the tarmac, with gaps between.

## v0.110.61 — wide-river bridges read as solid decks, not floating slabs
- A bridge across a wide river planted a pier under every densified deck point — ~50 thin stilts under
  a shallow slab, which read as a thin, floating deck. Piers now stand about every 25m (a handful, not
  a comb), and the deck girder deepens with the span it carries, so a long crossing reads as a solid
  beam. The drivable surface and the arch profile are unchanged; the railings keep their posts+rails.
- 👀 Cross a bridge over a wide river (e.g. Santiago) — the deck sits solid on a few piers, not a
  forest of stilts.

## v0.110.60 — birds perch in the crown, not the air above it
- A perched bird sat at a fixed 4.5m over its tree, but trees are built at a random scale (0.7–1.4×),
  so on a short tree the bird floated in clear air above the canopy (the horizontal clamp never fixed
  the vertical mismatch). Each tree now hands the flock its REAL crown height, so a landing bird
  settles among that tree's own leaves whatever its size. Deterministic — same crowns and perches
  every reload.
- 👀 Watch the flock come down in trees — no bird hangs motionless in mid-air over a small one.

## v0.110.59 — pause coordinates sit under the speedometer
- The pause-only x/z/heading readout was up over the city skyline (above the tacho); it now sits
  **under the speedometer** where the other instruments are, so it doesn't cover the view.
- 👀 Pause — the green coordinates line appears just below the speedo, not over the city.

## v0.110.58 — remove the broken waterfront collision (invisible walls)
- The waterfront-railing collision (v0.110.52) was placed on the wrong edges: it threw **invisible
  walls along whole riverbanks and across bridge approaches** — you couldn't drive the bridge or a
  wide strip beside the river — while the **visible rails had no collision at all** (you drove through
  them). The collision condition and the drawn rail had drifted apart. Pulled it out entirely for now,
  so the map is fully drivable again. The stone embankment and the bubbles are untouched. A correct
  version (with gaps where roads cross, matched to the drawn rail) is on the plan.
- 👀 Drive the bridge / riverbank that was blocked — it's clear again.

## v0.110.57 — arcade "find a car" mode, and Esc opens the menu
- New **Arcade** toggle in the settings (🕹): with it on, **pickable cars of other types** appear around
  the map — a real car, bobbing and turning to mark it collectable. **Drive into one and you become
  that car** (sedan → sports car → truck…), keeping your spot; the taken car respawns elsewhere as a
  new type. And **Esc now opens/closes the settings menu**, so the modes are reachable without the mouse.
- 👀 Open ⚙ (or press Esc), tick **Arcade: find a car**, then drive into one of the cars dotted about.

## v0.110.56 — traffic lights cycle at the junctions
- Major road junctions (T-junctions and crossroads) now stand a **traffic-light head** — red/amber/green
  lenses on a pole — that **cycles** green → amber → red and glows, its phase staggered from the next
  so a run of them doesn't switch in lock-step. Ambient for now (the bots don't stop at them yet).
- 👀 Pull up to a busy junction — a signal head cycling through its colours.

## v0.110.55 — railway platforms, and trains that stop to board
- Railways now get **platforms** along the line — a slab with a painted edge, a canopy on posts and
  lamps that glow at night, with **figures waiting** on it. A train **eases to a halt** at each stop,
  **dwells while figures board and alight**, then pulls away. Platforms are placed on straight stretches,
  clear of tunnels and level crossings.
- 👀 Follow a railway to a platform — a train slows in, the crowd shuffles on and off, then it departs.

## v0.110.54 — bot cyclists ride the streets
- **Bot cyclists** now pedal along the roads — slower than the traffic, hugging the kerb side like a
  bike lane, leaning gently into turns, legs pedalling in time with the ground and a **rear reflector
  that glows red at night**. Low-poly bicycles that stop pedalling when they stop.
- 👀 Watch the streets — cyclists roll along the kerb, legs turning, red reflector lit after dark.

## v0.110.53 — holiday fireworks, and pedestrians up on the bridges
- Load the game on a **firework holiday** — New Year's Eve/Day, the 4th of July, Bonfire Night — and
  **fireworks rise over the skyline** as you drive, paced to a pleasant cadence around the car. A pure
  date table decides the day; ordinary days are unchanged.
- **Pedestrians now walk over bridge decks** instead of trailing along the ground under them: a walker
  on a bridge road is seated on the deck (and river bridges carry people now, rather than blanking).
- 👀 Set your clock to Dec 31 and reload for fireworks; and walk the map to a bridge — people cross it.

## v0.110.52 — you can't drive through the waterfront railing now
- The embankment railing (набережная) was decoration — the car drove straight through it into the
  water. Each **embanked edge now has a solid barrier** in the physics grid, so the quayside stops the
  car. It's gated to embanked edges only: **open shores stay passable**, so you can still plunge into
  open water (and get the bubbles). If you're already in, the barrier nudges you back to the bank.
- 👀 Drive at a railed waterfront — the car is stopped at the rail, not sailing through into the river.

## v0.110.51 — shopfronts glaze the ground floor of shops
- Shops and civic buildings now get a proper **glazed shopfront** on the ground floor — a run of bright
  glass bays with a mullion, a stall-riser at pavement level and a fascia board — instead of the same
  repeating windows as the flats above. One instanced draw for the whole city; houses are unchanged.
- 👀 Drive a high street — the shops read as shops, glassy at street level.

## v0.110.50 — parked cars fill the car parks
- Car parks were bare tarmac. They now hold **parked cars** — laid out square in the marked bays
  (reusing the same bay layout the paint uses), about 60% of bays filled so it looks lived-in, each a
  different colour, draped on the terrain. Two instanced draws for the whole map, capped, static.
- 👀 Drive past a parking lot — rows of parked cars in the bays now, with gaps.

## v0.110.49 — a favicon for the browser tab
- The page had no icon — it now ships a crisp **SVG favicon**: a little red car on a strip of road, in
  the game's palette, so the tab and bookmarks are recognisable.
- 👀 Look at the browser tab — a red car icon instead of the blank default.

## v0.110.48 — bot motorcycles thread through the traffic
- Bot **motorcycles** now ride the streets alongside the cars — narrower and nippier, a rider on a
  low-poly bike with a **headlight that glows at night**, following the road graph like the other
  traffic and sitting tilted to the terrain.
- 👀 Watch the traffic — the odd motorbike weaves along the roads, headlight lit after dusk.

## v0.110.47 — an RPM tachometer above the speedometer
- A second round dial — an **engine-rev counter** in the same style as the speedometer — sits **above
  it**, so the two read as one instrument cluster. The needle sweeps up through a gear and drops on
  each "shift" as speed builds, blips when you rev on the spot, and kisses a **redline** near the top.
- 👀 Watch the tacho above the speedo as you accelerate — revs climb and reset through the gears.

## v0.110.46 — birds come in natural colours, with the odd white crow
- The flock was all one near-black tone. Birds now draw from a **natural plumage palette** — sparrow
  brown, tan, slate grey, a muted jay blue, crow black, starling and dove — per bird, and about **1 in
  22 is a rare white crow**. Still one instanced draw, same flight and flush.
- 👀 Watch a flock scatter — a mix of browns and greys, and now and then a white one.

## v0.110.45 — survive Overpass rate-limits, and stop hanging on a bad mirror
- When `overpass-api.de` started returning **429 Too Many Requests**, loads stalled: the client
  timeout was too long (100s), so a mirror that accepted the connection but never answered dragged the
  whole load out for minutes. Fixed three ways: the per-mirror timeout drops to **30s** so it fails
  over fast; a **third mirror** (private.coffee) is added to dodge a rate-limited one; and if every
  mirror refuses, the load now **falls back to a cached copy of that city** (even one fetched under an
  older query) instead of failing — so a place you've visited still loads when Overpass is down.
- 👀 On a flaky/limited connection, a previously-visited city still loads; new ones fail fast, not hang.

## v0.110.44 — no more phantom collisions from above or across a bridge
- Bot/pedestrian/train collision circles were 2D, so you'd **hit a bot you were flying 10m over** on
  a slope, or one on the road **beneath a bridge you were driving across**. Each obstacle is now gated
  by height: if the gap between the car and the ground under that obstacle is more than a few metres,
  it isn't solid to you. Normal driving (and the 1m hover) still collides as before.
- 👀 Jump/fly over a pedestrian, or drive a bridge deck over traffic — no invisible collision now.

## v0.110.43 — a Cancel button on the loading screen
- The "загружаю карту OSM" overlay now carries a localized **Cancel / Отмена** button. Press it and
  the in-flight load aborts at once (not retried) and you're dropped back to the start menu — or, if a
  city was already loaded, left on the map you were driving. No more waiting out a slow load.
- 👀 Start loading a city and hit Cancel — it stops immediately and returns you to the menu.

## v0.110.42 — the OSM load can't hang forever any more
- "Загружаю карту OSM" could stick for minutes: `fetch` has no timeout of its own, so a request a
  busy Overpass mirror **queues but never answers** hung until the browser's own ~5-minute wall — and
  that same stall is why benches, flowerbeds and monuments (all in the one features query) sometimes
  came back empty. Each mirror request now has a **client-side timeout** and aborts to fail over to
  the other mirror / retry instead of hanging. (`fetchOsm` also takes an abort signal now, for a
  Cancel button next.)
- 👀 Load a city on a bad connection — instead of hanging forever it retries and recovers (or errors).

## v0.110.41 — benches and trees fill the gaps between houses
- The bare ground between buildings was empty. It's now scattered with the odd **bench** and small
  **clumps of trees** — placed only in genuine inter-building gaps: never inside a footprint, off the
  roads, clear of water and of anything already there. Capped and instanced, built once at load.
- 👀 Look at the space between houses where there's no road — a bench or a little stand of trees now.

## v0.110.40 — doors get natural colours and handles
- The door brown looked unnatural. Doors are recoloured to a **natural palette** — honey-oak houses,
  painted slate apartments, heritage-green civic, glazed shopfronts — and every door now carries a
  **handle**: a round **knob** or a horizontal **lever bar** (by building kind), in one cheap instanced
  draw. No door reads as a flat black hole any more.
- 👀 Walk up to a few buildings — natural door colours, each with a knob or a bar handle.

## v0.110.39 — signpost poles no longer spike through the panel
- On POI/landmark signposts the post ran up its full height **through the sign panel**, poking out
  above it — ugly. The panel is now bolted to the **front** of the post and the post stops **flush
  with the panel's top**, so the pole backs the sign from behind instead of spiking through it.
- 👀 Find a café/fuel/landmark signpost — the panel reads clean, no pole sticking out the top.

## v0.110.38 — manhole covers get cross-hatched ironwork
- The manhole covers down the road centrelines were smooth; they now carry a **perpendicular waffle
  of raised ribs** (three bars each way), like real cast-iron covers. It's merged into the same shared
  cover geometry, so it rides every instance for free — no extra draw calls, bolts and ajar tilt kept.
- 👀 Look down at a manhole in the road — a cross-hatch of ridges across the lid.

## v0.110.37 — no more bouncing and launching on bridge arches
- Driving up a bridge the camera juddered and the car eventually flung itself into the air near the
  crown. The deck lookup, when the car asked what it was riding, returned the **highest** deck segment
  in reach — and on an arch the segment just ahead is higher, so the ride staircased **upward** on
  every climb and launched the car. It now rides the deck **directly beneath** it (the nearest
  segment); "what's overhead?" queries still get the highest deck, so flyovers are unaffected.
- 👀 Drive up and over an arched bridge — the climb is smooth, no juddering or take-off near the top.

## v0.110.36 — knockbacks swing out smoothly instead of snapping
- The bot/pedestrian knockback (v0.110.31) jumped the whole distance in a single frame, which read as
  a hard snap. A shove now sets a **target** the bot eases toward, and the target relaxes home — so a
  rammed car or person **swings aside and back smoothly** over about a second instead of teleporting.
- 👀 Ram a bot: it slides away and settles back, no instant jerk.

## v0.110.35 — nitro strung along the highways, right across the map
- Where a long, near-straight arterial runs across the city, nitro bottles are now laid in a **spaced
  chain along it** (about every 110m, only on the major roads), so you can boost the whole way across
  the map on one road — without the bottles crowding together. The near-car scatter stays as before.
- 👀 Find a long straight highway and follow it — a line of evenly-spaced nitro bottles runs down it.

## v0.110.34 — the sky helicopter looks like a helicopter now
- The ambient **helicopter** over the city was a plain body with a rotor; it's rebuilt with a rounded
  cabin, a **glass nose canopy**, a tapering **tail boom** with a fin, an engine housing and mast, and
  **landing skids** — still low-poly for distant sky traffic. Main and tail rotors spin as before.
- 👀 Look up for a helicopter crossing the sky — it now has skids, a canopy and a proper tail.

## v0.110.33 — turn fuel use off for a free-roam drive
- A new **Fuel use** toggle in the settings menu. Leave it on for the usual game — the tank drains and
  you top up at petrol cans — or switch it **off** so the tank never empties and the car never loses
  its legs to a dry tank, for pure free-roaming. Remembered between sessions.
- 👀 Open ⚙, untick **Fuel use** — the gauge stays full however long you drive.

## v0.110.32 — bot buses stop at stops and pick up passengers
- Buses now drive the roads and **route to bus stops**, halting a few seconds at each while a little
  crowd of figures at the kerb **boards** (shrinks away) and **alights** (grows in), then pull off to
  the next stop. Long liveried bodies with a window band and lamps that **glow at night**, six wheels,
  sat on the terrain like the other traffic.
- 👀 Follow a bus route — a bus pulls in at a stop, figures gather and board, then it drives on.

## v0.110.31 — ram a bot and it gets knocked back too
- Until now, ramming a bot car or a pedestrian bounced **only you** — they stood their ground. Now
  whatever you hit is **shoved back** along the impact line, harder the faster you drove into it, then
  eases back onto its route over about half a second. The knock feeds the collision circle too, so you
  can't instantly re-hit it on the spot.
- 👀 Drive hard into a bot car or a pedestrian — it lurches away from you instead of stopping you dead.

## v0.110.30 — bubbles rise when you sink under water
- Drive off a quay and sink until the car is **fully under water** (surface above the roof) and a
  stream of **bubbles rises from the car to the surface** — swaying, swelling and popping at the top.
  One instanced draw, a small pool, only while submerged; each city's water-surface heights are
  cached once at load so the check costs nothing per frame.
- 👀 Plunge the car deep into a river or the sea until it's under — bubbles trail up to the surface.

## v0.110.29 — lock the clock to a day or night drive
- A new **time-of-day** control in the settings menu (under Weather): leave it on the full
  **day/night cycle**, or lock it to **Always day** (permanent noon) or **Always night** (permanent
  midnight) for a pure daytime or nighttime cruise. The choice is remembered between sessions.
- 👀 Open ⚙, click the 🔄 time button to cycle to ☀ Always day / 🌙 Always night — the sky holds there.

## v0.110.28 — forests and woodland fill in with real trees
- Woods (`natural=wood`, `landuse=forest`) — including multipolygon relations — used to get only the
  same **sparse scatter** as a small park, so a big forest read as bare green. They're now filled with
  a **dense canopy**: a jittered grid inside each wood, on its own RNG stream and a global budget
  (~9 m spacing, capped at 2000 trees map-wide), reusing the seasonal instanced tree meshes — so it's
  built once at load with no per-frame cost. Parks, scattered trees and seasonal crowns are unchanged.
- 👀 Drive to a wooded area (e.g. a city with a big forest on its edge) — it's a thick stand of trees now.

## v0.110.27 — pedestrians dress for the season
- The crowd's clothing is now **recoloured for today's season**: muted, darker garments in winter,
  bright and light ones in summer, with spring and autumn in between. The city's **latitude** picks
  the season, so a January stroll dresses for **summer in Sydney** and winter in Stockholm. It's a
  one-time instance-colour swap at spawn — no per-frame cost — and hair keeps its natural colours.
- 👀 Load a northern city in summer vs. a southern one and watch the wardrobe flip.

## v0.110.26 — level-crossing barriers stand where a road meets the rails
- Crossing booms were hunting for **rail-meets-rail junctions** (vanishingly rare) — they now find
  the real thing: where a **road crosses a railway** at grade. Each such crossing gets a pair of
  booms, oriented across the road, that **lower as a train approaches** and lift once it's clear.
- 👀 Drive along a railway in a city with level crossings — the striped booms drop as a train nears.

## v0.110.25 — landmark signs stand beside the monument, not through it
- The glowing landmark sign sat on the **same OSM point as the monument statue**, growing straight
  through it — it now stands a couple of metres **to the side** (a deterministic offset). And a
  statue no longer **stands inside a tree**: any tree within ~2.5m of a monument is cleared away.
- 👀 Find a monument: its beacon is beside it, and it's not sprouting a tree.

## v0.110.24 — the title is localized (Мчись по городу)
- The start-screen title now **switches with the language**: EN "RACE THE CITY", RU "МЧИСЬ ПО
  ГОРОДУ", updating live when you flip EN / RU. The gradient logo styling is unchanged; it was the
  last hard-coded string on the start menu.
- 👀 Flip to RU on the start menu: the title reads "Мчись по городу".

## v0.110.23 — zoom the minimap (works on touch)
- The minimap gains **+ / − buttons** to zoom through a few steps; the chosen level **persists** across
  reloads. Wired with pointer events so it **works on touch** (mobile), and the tap doesn't fall
  through to driving. Everything the minimap draws scales at every level.
- 👀 Tap + / − on the minimap to zoom it in and out.

## v0.110.22 — bot cars queue instead of driving through each other
- AI traffic had no awareness of itself — a faster car slid **clean through** a slower one in the
  same lane. Cars now keep a **following gap**: each looks at the car ahead in its lane (and just
  across the junction it's approaching) and eases to a stop behind it, queuing nose-to-tail. It only
  looks forward, so junctions don't deadlock; oncoming traffic passes in the other lane. O(cars) via
  per-edge bucketing — no frame-rate cost.
- 👀 Catch up to bot traffic: cars line up behind each other instead of merging into one spot.

## v0.110.21 — trees turn with the seasons
- Deciduous tree crowns now colour by the **real date and the city's latitude**: green in summer, a
  lift with a scatter of **white-pink blossom** in spring, **ochre/orange/red** in autumn, and a bare
  grey-green in winter (evergreens catch a dusting of snow). The southern hemisphere runs the opposite
  half of the year. A per-instance colour swap on the existing tree draw — no cost. (Grass/parks by
  season is a small follow-up.)
- 👀 Load a city in autumn: the deciduous trees are turning; in spring, some are in blossom.

## v0.110.20 — building plinths are solid, not striped with windows
- On a slope, a building's below-ground-floor plinth got the **window texture repeated down it** —
  v0.110.16's max-seating made big sloped buildings show a **tall striped base** (the "some buildings
  render with an error" report). The wall is now **split at the ground floor**: windows above, a
  solid plain plinth below. Flat-ground buildings and the no-underground-windows fix are unchanged.
- 👀 A big building on a hillside: a clean solid base under the windows, no stripes down the plinth.

## v0.110.19 — manholes with rim bolts, and some left ajar
- Manhole covers gain **four small bolts around the rim** (baked into the shared cover geometry, so
  still one instanced draw for the whole city), and about **one in eight now sits ajar** — tilted and
  nudged off-seat as if not fully closed. (The wheel dropping into an open one is still to come.)
- 👀 Look closely at the covers: bolts round the edge, and the odd one lifted at a corner.

## v0.110.18 — a railing along the waterfront
- The stone embankments now carry a low **balustrade along the shore** — thin posts every few metres
  with a top rail — seated on the embankment lip. Distance-spaced and capped, so even a kilometre of
  river outline stays one cheap merged draw; tiny ponds get none.
- 👀 Drive a riverside: a railing runs along the water's edge.

## v0.110.17 — birds perch in the tree, not in mid-air
- A bird landing in a tree snapped to the trunk, but its flock-formation offset (up to ~5m) was added
  at render time — **flinging it clear of the tree's small canopy**, so it sat in mid-air over
  nothing. Tree perches now **clamp that offset to the canopy radius**, so birds cluster in the
  foliage; ground and rooftop perches keep their full spread unchanged (no return of the old heap).
- 👀 Watch birds settle in a tree: they sit in the foliage, none hanging in open air beside it.

## v0.110.16 — no more windows buried in the ground
- On sloping ground a building's window grid started from the **average** terrain under its
  footprint, so the uphill wall — standing over higher ground — had its lower window rows **below the
  surface** (lit windows down in the dirt). The facade is now seated at the **highest** terrain under
  the footprint, so every window clears the ground; the downhill side just shows a taller plinth, as
  a level-floored building on a slope should.
- 👀 Find a building on a hillside: its windows sit above the ground on the uphill side now.

## v0.110.15 — trains: real windows and smooth cornering
- Train and tram cars had a single **glass stripe** running the whole length; each now carries a
  **row of separate windows** with pillars between them (one merged draw per car, still lit at
  night). And a car's heading is now taken from **where its two ends rest on the rail**, not the one
  segment under its middle — so it **flows through curves and over humps** instead of snapping a
  right-angle at each vertex.
- 👀 Watch a train round a bend: separate lit windows, and it curves smoothly, no kinking.

## v0.110.14 — bot cars round corners smoothly
- AI traffic **snapped a full 90° at junctions**, pivoting on the spot. Cars now **ease their heading**
  toward the road they're turning onto (over about half a second) while staying pinned to the road,
  so they **arc through the corner** instead of spinning in place. A fast car sweeps a wider arc than
  a slow one, as you'd expect. Costs one exp per car per frame.
- 👀 Watch traffic at a crossroads: cars swing round the turn, no instant snaps.

## v0.110.13 — flowerbeds bloom with real flowers, in more colours
- The flowerbed blooms looked like **mushrooms**; each is now a real **petalled flower** — a ring of
  six petals cupping up around an amber centre — and the palette gains **blue, violet and azure**
  beside the pinks, golds and whites. Still a fixed set of merged draws for the whole city, no cost.
- 👀 Drive past a flowerbed: petalled flowers in a mix of colours, not mushroom caps.

## v0.110.12 — the car stops twitching in the air
- Airborne, the car kept tilting to the **terrain normal skimming past below it** — which changes
  every frame at speed — so it juddered in all directions in flight even with only forward held. It
  now holds **level while airborne** (as it already did on a bridge deck / hovercraft), pitching to
  the slope only when it's actually on the ground.
- 👀 Launch off a ramp and hold forward: the body stays steady in the air instead of shaking.

## v0.110.11 — street benches are back
- Street benches had vanished from most cities. Cause: benches were thinned to a single 55 cap
  **before** roadside and park benches were told apart — and a well-surveyed park's benches ate the
  whole budget, leaving about one bench on the streets. Roadside and park benches are now **capped
  independently**, so a bench-heavy park can't starve the pavements.
- 👀 Drive a street: benches along the kerb again, not only in the parks.

## v0.110.10 — dense cities (São Paulo) get their buildings back
- Dense downtowns rendered almost no buildings. Root cause (measured): under server load, Overpass
  answers the game's one heavy combined query with **HTTP 200 but a timed-out, near-empty body** —
  which passed the `res.ok` check, got cached, and drew as a buildingless city. Buildings now fetch
  in **their own Overpass query** (merged with the rest), the server timeout is raised to 90s, a
  **second mirror** is tried on failure, and a **silent timed-out 200 is rejected** instead of
  cached. São Paulo's 6500+ buildings come in now.
- 👀 Load São Paulo (or another big downtown): buildings, not bare streets.

## v0.110.9 — a proper rowboat, with someone rowing it
- The rowboat is reshaped into a real small-boat hull — pointed bow, squared transom, gunwale strakes
  and seat planks — and gains a **little figure rowing with two oars**: the oars sweep and dip (blade
  in the water through the stroke, lifting on the return) and the rower leans with it. The small ponds
  got their rowboats in v0.108.1; now they're worth a look.
- 👀 Find a boat on a river/pond: it's boat-shaped and someone's rowing it.

## v0.110.8 — stone embankments instead of floating water
- The water's edge is now a **stone embankment sized to the water**: a dry grey-stone lip above the
  waterline and a **darker wet band below it** (the tide-mark), toned to sit with the grass and
  tarmac — not red brick — so a river reads as a built, edged channel instead of bare water sitting
  on the grass. Flat vertex colours, one extra mesh per body — no texture, no frame-rate cost.
- 👀 Drive along a river: a stone bank with a wet line at the water, meeting the ground cleanly.

## v0.110.7 — a failed load stops breaking the menu, and shows progress
- A city that failed to load used to pop the **whole start menu — with a broken layout — over the
  game you were driving**. Now if you already had a map, a failed switch just keeps you on it (a
  failed Play/Random pick drops you into the backdrop you were watching); the menu only returns when
  **nothing has ever loaded**, and its column layout is fixed (it was collapsing to a block).
- The **loading spinner/progress now shows above the animated backdrop** instead of hidden behind it,
  so a slow or retrying first load is no longer a progressless void.

## v0.110.6 — bridge railings look like railings
- The bridge railings were a solid parapet wall; they're now a proper **see-through balustrade** —
  thin posts every ~2.5m with a top and a mid rail spanning between them, following the deck's arch.
  Still merged into the one railing draw call.
- 👀 Drive a bridge: you can see through the railings between the posts.

## v0.110.5 — emergency beacons flash
- The police car's (and ambulance's / fire-truck's) roof beacons now **strobe red↔blue** instead of
  glowing steady, so an emergency vehicle reads at a glance.
- 👀 Drive the 🚓 police car (or 🚑/🚒): the roof bar flashes.

## v0.110.4 — nitro and fuel stay on the map
- Pickups scatter on road vertices, and some OSM roads run past the map's ±RADIUS edge — so a bottle
  could float out over the void beyond the ground. Candidate spots are now filtered to the drivable
  ground, so no pickup sits off the map.

## v0.110.3 — water meets the shore instead of floating
- On sloping ground a flat water surface floated where the bank dropped below its level, showing
  daylight under the water's edge. Each water body now hangs a **skirt from its perimeter down past
  the ground**, so the water always meets the shore instead of hovering. Merged into the same
  material — a handful of triangles per body, no frame-rate cost.
- 👀 Drive along a river on a slope: the water's edge meets the bank, no floating gap underneath.

## v0.110.2 — bridges that read right: flush paint, solid deck, seated railings, buried pillars
- The bridge deck's long-standing mess is fixed: the lane **markings floated 18cm above the deck** (a
  surface-lift meant for ground roads was double-counted on decks) — now flush; the **deck is a solid
  slab** with a fascia down each edge instead of a paper-thin plane; the **railings stand on the deck
  edge** instead of hovering a metre off it; and the **support pillars stop at the deck's underside**
  instead of poking up through the road. All merged into the existing draws — no frame-rate cost.
- 👀 Drive a bridge: paint on the deck, the deck has thickness, railings sit on its edge, no pillars
  through the surface.

## v0.110.1 — birds fly up, not into the ground
- On terrain higher than the birds' cruising altitude (a hill, a raised city), a startled bird
  "climbed" toward a fixed **absolute** height that was below the ground, so it **sank out of sight**
  instead of flying up — obvious the moment the car drove up and flushed one. Flight height is now
  measured **above the ground beneath the bird**, so they always climb away and never fly into a
  hillside.
- 👀 Drive up to birds on high ground: they take off up and away, no more vanishing downward.

## v0.110.0 — four new vehicles: pickup, police, ambulance, fire-truck
- Four new drivable models join the roster: a **pickup** 🛻 with an open cargo bed, a **police car**
  🚓 with a roof lightbar and push-bar (interceptor pace), an **ambulance** 🚑 (white box body, red
  cross, blue beacon), and a **fire-truck** 🚒 with a raked roof ladder and twin beacons. Each is a
  real, distinct low-poly model; the beacons glow with no per-frame cost.
- 👀 On the start menu (or ⚙ → vehicle), pick one of the four new vehicles.

## v0.109.0 — glowing markers over landmarks
- Tourism and historic sights — attractions, museums, artwork, viewpoints, monuments, memorials,
  castles, ruins — now get a **glowing gold beacon**, the same instanced signpost the game already
  uses for cafés and fuel. One draw for the whole city, so no frame-rate cost. (Also the groundwork
  for a future "tour" mode.)
- 👀 Drive a city centre: landmarks glow gold, distinct from the café/fuel markers.

## v0.108.7 — flowerbeds grow on stems
- The flowerbeds were a flat mat of blooms; each flower now stands on its own **stem of varied
  length** — a gentle dome, tallest in the middle, with a per-flower wobble — so a bed reads as
  tended rather than painted on. Still one merged draw call per bed, so no frame-rate cost.
- 👀 Drive past a flowerbed: the flowers stand up on stalks of different heights, mounded in the centre.

## v0.108.6 — version moves into Settings, off the fuel gauge
- The build version sat in the bottom-right corner **overlapping the fuel gauge**. It's moved into
  the **⚙ Settings → About** panel, so the corner reads clean.
- (Dev) `boot-check` no longer hangs on the start screen's looping loading animation — it opts the
  animation out under the harness, so the release gate is reliable again.

## v0.108.5 — Random keeps the loading screen; load errors clear themselves
- Clicking **Random city** (or searching one) used to drop the whole menu and leave a **black screen**
  while the new city loaded. Now the animated **synthwave backdrop stays up as a loading screen** —
  like the splash — and fades into the live city once it's ready.
- A failed load ("couldn't load the city") no longer **hangs forever**: the notice clears after 5s
  and the start menu returns, so you can try another city.

## v0.108.4 — pause shows your exact position, for bug reports
- Pausing now prints the car's **world x/z and heading** above the city name. Screenshot a glitch
  with the game paused and it carries the exact spot and facing, so the view can be reproduced and
  the bug chased from where you actually were — no more guessing where a screenshot was taken.
- 👀 Press pause: a small green readout (x, z, heading°) shows over the location name.

## v0.108.3 — people keep off the water
- A lakeside pavement could nudge a pedestrian off the road and out onto the water, where they walked
  along the **lake bed under the surface**. Now if the pavement they'd take lands on water they
  **cross to the other side of the road**; if both sides are water (a causeway or bridge deck) they
  are simply **not drawn there** — either way, nobody tramps across the bottom of a lake. The check
  is a cheap point-in-outline test on the handful of nearby walkers, so it costs no frame rate.
- 👀 Drive along a lake or river: people stay on the land side of the road, none out on the water.

## v0.108.2 — birds scatter when you drive up
- Drive up to birds settled on the ground or a rooftop and they now **flush** — springing into the
  air at once and breaking away from the car, instead of sitting there as you bear down on them.
- 👀 Aim the car at a group of grounded birds: they take off and scatter away as you get close.

## v0.108.1 — boaters on the small lakes too
- Small ponds and lakes floated no boats, while big harbours and rivers were fine. Two things hid
  them: the boat-spot search only kept water at least a ship's turning-room wide, and its 40m
  map-wide sampling grid stepped clean over anything pond-sized. Now, when nothing turns up on a
  body of water, a **fine sweep of just that water's own outline** finds a spot down to a rowboat's
  size — so a village pond gets its rowboat.
- 👀 Find a small lake or pond: there's a little rowboat pottering on it now.

## v0.108.0 — a synthwave loading screen, not a black void
- While the first city loads behind the start menu (on boot, or after a page refresh), the backdrop
  was a **dead black screen** until the demo kicked in. It's now an animated **synthwave sunset** —
  gradient sky, a glowing sun and a perspective grid scrolling toward you — that **fades out the
  moment the live city is on screen**, so there's no ugly black gap before the demo starts.
- 👀 Reload the page: the menu sits over a moving neon horizon, which dissolves into the live demo
  city once it finishes loading.

## v0.107.5 — birds don't pile up where they land
- Grounded birds were landing in a heap: the whole flock aimed every landing at one spot near you,
  spread only a couple of metres — fine when they were flat diamonds, an ugly pile now they have
  bodies. Each bird now aims its own landing a little way off, so on open ground they **spread out**
  to settle; in a tree they still gather in the canopy, where a cluster looks right.
- 👀 Watch birds come down on grass: they land spread across the ground, not stacked on each other.

## v0.107.4 — manholes that sit in the road, not on it
- The covers were too dark — near-black on grey asphalt — and too frequent. They're now a **worn
  iron grey a shade off the tarmac** and **matte**, so they read as lids set into the road rather
  than black discs punched through it; they're **rarer** (90–180m apart, up from 50–100m); and they
  no longer land on **footpaths and cycle paths**, only on drivable roads.
- 👀 Drive a street: the manholes are sparse and blend into the asphalt, and there are none on the
  pavements.

## v0.107.3 — a home of its own: race-the-city.games
- The game now lives at its own domain, **race-the-city.games** (the old
  `kryadov.github.io/race-the-city/` still redirects). A `CNAME` is shipped in the build so every
  deploy keeps the custom domain instead of dropping it. No code moved — asset paths were already
  relative (`base: './'`), so the site runs identically at the domain root and the old sub-path.

## v0.107.2 — birds on the ground look like birds, and potter about
- A perched bird was just the flight shape holding still — wings spread flat, no motion — which read
  as a **flat diamond** and looked dead. Grounded birds now **fold their wings in**, stand plumper,
  and gain a **head, neck and tail**; they **turn to look about, shuffle a step with a low hop, and
  dip to peck** now and then. Takeoff and flight are byte-for-byte unchanged — only the perched look.
- 👀 Find birds settled on a roof or by a tree: bird-shaped now (head up, wings folded), and they
  keep pottering — turning, stepping, pecking — instead of sitting frozen.

## v0.107.1 — the camera stops looking under the map on steep hills
- Driving off a steep downslope, the chase camera could sink below the terrain and show the ground
  mesh's **underside** and buildings poking through the void. The camera's height is now **clamped
  to stay above the ground directly beneath it** (with clearance for the near plane), so the view
  never drops under the world. Look direction, tunnel pull-in and hover framing are untouched — it
  only lifts when it would otherwise clip below the surface.
- 👀 Drive down a steep hill (Sydney is a good test) — the camera holds above the road, no red/brown
  void underneath.

## v0.107.0 — four more synth tracks on the radio
- Added **Neon Overpass**, **Midnight Pursuit**, **Neon Horizon Run** and **Red Banner Drive** to
  the in-game soundtrack — more night-drive synthwave to cycle through while you play.
- 👀 ⚙ → Audio: step through the track list to the four new ones.

## v0.106.2 — Random & city-search start the game, not just the backdrop
- On the start menu, **🎲 Random city** and the city-search **Go** only swapped the backdrop and
  left the menu up — and if you pressed them while the opening backdrop was still loading (the case
  right after a page refresh), nothing happened at all: the menu sat there with the demo driving
  underneath. Both now **start a driving session** in the chosen city and the picked mode, and a
  click made while a load is in flight is **queued** and honoured once it lands, never dropped.
- 👀 After a refresh, on the start menu: hit 🎲 (or type a city and press Go) — the menu goes away
  and you're driving there in the selected mode. Play and Continue behave as before.

## v0.106.1 — the "new version" notice is clickable over the menu
- The update banner was behind the start-menu overlay, so you could not click it. It sits above
  the menu now (z-index), so a fresh build is one click away even on the start screen.

## v0.106.0 — manholes, bigger, rarer, off to the side
- Manholes are bigger again (~1.2m across), much **rarer** (50–100m apart), and now sit **off the
  centreline into a lane** (a random side) rather than in a dead-centre line down the road — far
  more natural.

## v0.105.0 — the taxi fare, made clearer
- The taxi HUD shows the **street** of the pickup / drop-off (📍), so you know where you're headed.
- The **minimap marker is coloured by phase** — green for the pickup, amber for the drop-off, to
  match the pillar of light — and still arrows to it from the rim when it's off the map.
- The fare is now a **little person who waves you over** at the pickup, and a cheering one at the
  drop-off when you deliver in time.
- 👀 Start Taxi and Play: the street shows under the objective, the minimap marker is green (pickup)
  then amber (drop-off), a passenger waves at the pillar, and cheers when delivered.

## v0.104.2 — deploy fix (the live site was stuck at 0.100.2)
- The density unit test wasn't updated when the density scale was rescaled in v0.101.0, so the
  **Deploy workflow's test step failed** and GitHub Pages stopped publishing at 0.100.2. Test fixed
  — every release since (convex manholes, flowerbeds, wall-slide, benches, About panel, odometer…)
  now reaches the live site.

## v0.104.1 — odometer to the bottom-right
- The distance readout moved out from under the speedometer to the bottom-right, stacked over the
  fuel bar — the speedometer stands clean on its own.

## v0.104.0 — About panel, and language on the start screen
- New **About** group in the settings menu: a short description, a link to the **developer**
  (github.com/kryadov) and one to **support the project** (github.com/sponsors/kryadov). Localized.
- The **start screen now has an EN / RU language toggle** — switch before you even load a city, and
  the menu re-translates on the spot.
- 👀 Open ⚙ → About for the links; flip EN/RU on the start menu.

## v0.103.0 — benches that line up along the road
- Fewer benches (capped), and a roadside bench now stands **parallel to the road** — a run of them
  lines up down the street instead of scattering every which way. Benches out in the open (a park)
  still face any direction.
- 👀 Walk a well-mapped street: benches along it stand in line with the kerb, and there are fewer.

## v0.102.0 — slide off a wall, and two more tracks
- Pressed against a building, the car used to **crawl** and steering away was a fight — it bled all
  its speed on any wall touch. Now it **slides**: only the into-wall speed is killed and the
  tangential is kept, so grazing a building and peeling off are smooth.
- Two new tracks on the radio: **Moonlit Highway Bloom** and **Rain on Shibuya**.
- 👀 Drive up against a wall at an angle and steer away — you should slide off, not stall. And
  listen out for the two new tracks.

## v0.101.0 — manholes, flowerbeds, and busier streets
- **Manholes** are now **convex iron domes** (not flat pucks), bigger (~0.9m across), and spaced
  further apart (32–55m) so they don't carpet the road.
- **Flowerbeds** got a proper **bed of pink/gold/white flower heads** over green inside a stone
  kerb — instead of a flat pink disc.
- **Density rescaled**: the old "many" is the new "normal", the old "normal" is the new "few", and
  "many" is now double the old "many" — traffic and crowds go up a notch at every setting.
- 👀 Drive a well-mapped city: domed manholes down the lanes, flowerbeds that read as flowers, and
  noticeably more cars/people at the same setting. (Manholes are visual for now — the car doesn't
  yet feel the dome; deferred as a poor cost/benefit at 14cm.)

## v0.100.2 — fuel gauge moved to the bottom-right
- The fuel bar moved out from under the speedometer to its own spot at the **bottom-right**, with a
  ⛽ icon — a warning light where the eye lands, not tucked under the dial.

## v0.100.1 — the start menu is clickable again (critical fix)
- Fix: the start menu (and the replay bar) were **completely unclickable** — `#ui` is
  `pointer-events:none` so every widget must opt back in, and these two didn't. The app was stuck
  on the menu from v0.98.0. This time verified with a real click test (Playwright), not a screenshot.

## v0.100.0 — record & replay your drive
- Record a drive and watch it back. A **REC** button captures your car's path; **Replay** retraces
  it with the camera following — pose-based, so it's smooth and doesn't care that the traffic,
  weather and nitro all rolled their own dice.
- 👀 In-game (after Play), bottom-centre: tap **● REC** to start (it shows the running time), tap
  again to stop, then **▶ Replay** to watch it back — the car retraces the exact path you drove.
  Changing city clears the recording.

## v0.99.0 — taxi mode
- A new arcade mode, **Taxi**: pick a passenger up at the glowing marker, deliver them to the next
  marker before the meter runs out, then straight on to the next fare — a shift that **chains**,
  the score climbing with every drop-off. Start it from the menu's Mode row.
- 👀 On the start screen pick **Taxi**, then Play. Follow the **green** pillar of light to the
  fare, then the **amber** pillar to drop them off — beat the timer for a chime + fireworks; miss
  it and the meter starts a fresh fare from where you are. Fares & score sit under the minimap, and
  the target shows on the minimap.

## v0.98.0 — start menu
- A branded **start screen**: RACE THE CITY, a big Play, and quick picks — city search + 🎲 random,
  a vehicle strip (+ "More…" for the full roster), and a mode (Free roam / Time trial / Race) —
  over a **live city driving itself** on autopilot as the backdrop. A saved session adds **Continue**.
- 👀 On load you now get the menu over a random city that drives itself. Type a city (the backdrop
  reloads to it), pick a car and a mode, then ▶ Play to take the wheel. Come back with a saved
  session and there's a Continue button. A `?city=` link pre-fills the city.

## v0.97.0 — café & fuel signposts
- Points of interest from OSM get a **signpost**: a post with a small panel, café = warm
  brown/red, fuel = green, with a glowing glyph. Five draw calls for the whole city.
- 👀 Drive a high street or a main road: look for the little brown (café) and green (fuel) signs
  on posts. They glow amber in **neon** mode (V).

## v0.96.0 — benches & bus stops
- **Benches** (some with a blocky figure sat on them) and two-post **bus shelters** with a sign,
  from OSM `amenity=bench` / `highway=bus_stop`.
- 👀 Pavements and stops in a well-mapped city: benches (~2 in 5 occupied) and bus shelters.

## v0.95.0 — manhole covers
- Iron **manhole covers** dotted down every street's centreline (procedural, not from OSM).
- 👀 Look down at the road as you drive — round dark covers spaced along the lane, none piled at
  junctions, none on bridges.

## v0.94.0 — launch off a ledge
- Come off a **roof edge or the end of a high bridge** and the car now flies off the lip in an
  arc, carrying its speed, instead of dropping straight down through the surface.
- 👀 Drive off a roof you've landed on, or off an abrupt high bridge end: you should launch and
  arc down, not fall vertically. Kerbs and normal hills behave as before.

## v0.93.1 — the map edge you can see
- The boundary **marker** is now opaque from the ground up (it had been densest ~35m underground,
  so invisible). An amber wall reads as the edge.
- 👀 Drive to the edge: a clear amber wall of mist. (Known: at dusk the sky itself goes orange, so
  the amber can blend then — report if it bothers you.)

## v0.93.0 — birds with a body
- Birds got a low-poly **body** under the flapping wings, instead of two flat triangles.
- 👀 Watch the flock overhead / perched — they should read as birds with volume, not paper darts.

## v0.92.1 — a square map edge you can drive to
- The world boundary is a **square** matching the ground (was a circle that braked you among the
  outer houses), with a **mist wall** so the map doesn't just stop in a ragged void.
- 👀 Drive to the far streets and to the edge: no braking among central houses; a soft stop at a
  marked edge. Corners of the map are reachable now.

## v0.92.0 — keep the car on the map *(superseded by v0.92.1)*
- First cut of the world edge (a circular boundary + mist). Fixed in v0.92.1.

---

## Earlier releases

- **v0.91.1** — birds you could actually watch
- **v0.91.0** — a jeep, yachts and sailboats, birds that behave like birds
- **v0.90.1** — driving under your own markings on a bridge
- **v0.90.0** — birds; docs brought up to what the game actually is
- **v0.89.0** — petrol cans, a tank to put them in, and a pantograph that trails
- **v0.88.x** — trains out of a tunnel not each other; nitro spacing; Tokyo spawn
- **v0.87.x** — land on the roof you just cleared; ships that stay in the water; the Nile
- **v0.86.0** — a jump clears what it is over
- **v0.85.x** — four kinds of monument; a lake with something on it
- **v0.84.x** — bridge-join launch; trains you never met; skid-mark width; palms; hill ride
- **v0.83.x** — race three rivals round the gate course, with fireworks; tram/mainline split
- **v0.82.x** — gates you drive through + next-gate arrow; the boot check; revisited-city rail
- **v0.81.x** — black cars; track that looks like track; no bridge shudder; ships on grass
- **v0.80.x** — controls card, crowd density, visible aircraft; balloons; real-size fountains
- **v0.79.x** — batched buildings; trains on the track; random-city world; Monaco; reset line
- **v0.78.x** — helicopters + varied aircraft; trams; railway cleanup; readable fountains
- **v0.77.x** — time trial, horn, checkpoint chime; flat decks / traffic / trains fixes
- **v0.76.x** — boats + livestock; solid detailed traffic/people; autopilot uses nitro
- **v0.75.0** — traffic and pedestrians
- **v0.74.0** — planes overhead and trains on the rails
- **v0.73.0** — fountains, statues and flowerbeds
- **v0.72.0** — demo mode — the car drives itself
- **v0.71.x** — jumps; brake test
- **v0.70.0** — big rivers
- **v0.69.0** — bridges you can actually drive on
- **v0.68.x** — parking areas; stars + a moon; lens/housing refactor; palette tweaks
- **v0.67.x** — the car drove on a surface nobody could see; readable facades
- **v0.66.0** — buildings get windows, doors and signs
- **v0.65.x** — palms in southern cities; nitro spool; update-notice dismissal
- **v0.64.x** — nitro exhaust flame (from the actual exhaust)
- **v0.63.x** — pause button; steered-wheel direction fix
- **v0.62.0** — steered wheels turn; the tiller gets a trailer
- **v0.61.x** — per-vehicle engine sound + park silence; water levelling
- **v0.60.0** — stars in the night sky
- **v0.59.x** — real music tracks like a radio; geocode to town centre
- **v0.58.0** — ten more vehicles + grouped picker
- **v0.57.x** — collapsible menu groups + reset-location; nitro scatter
- **v0.56.x** — odometer + km/miles; retry flaky loads
- **v0.55.0** — buildings read as separate volumes
- **v0.54.0** — visible glass on enclosed vehicles
- **v0.53.0** — pull the camera in when a building blocks the car
- **v0.52.0** — low/normal/high rendering modes
- **v0.51.0** — six more vehicles incl. a leaning motorbike
- **v0.50.0** — notify when a new version is deployed
- **v0.49.0** — use your own audio file as looping music
- **v0.48.0** — save & resume session (city + car pose)
- **v0.47.0** — pull the camera in inside tunnels
- **v0.46.0** — warm up shaders/GPU during load
- **v0.45.x** — nitro pickups; realistic snow
- **v0.44.0** — loading progress bar
- **v0.43.0** — random-city button
- **v0.42.0** — auto weather cycling
- **v0.41.x** — shareable `?city=` link; deterministic tree scatter
- **v0.40.0** — fender repeaters + faster indicators
- **v0.39.0** — camera zoom slider
- **v0.38.0** — longer drift trail
- **v0.37.0** — reworked street lamps + arrow signs
- **v0.31.0–v0.36.0** — lamps & signs; turn signals + tail lights; sky dome; light reworks; neon
  coverage for trees/lamps/signs
- **v0.10.0–v0.30.0** — water; music tracks; compass; car tilt; greenery & trees; sea; railways,
  bridges & tunnels; skid marks; HUD; headlights; green ground; shadows; speedo gauge; weather;
  road markings; clouds; brake lights
- **v0.1.0–v0.9.0** — version badge + releases; RU/EN i18n; drift physics + vehicle select;
  rolling wheels; settings menu; audio; minimap; road labels; day/night; touch controls

Full notes for any version are on its **GitHub Release**.
