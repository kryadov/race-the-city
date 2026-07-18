# Changelog

Every version is a deployed build and a GitHub Release. Newest first. 👀 = what to look for when
you play-test that version.

> Keep this current: every release adds an entry here in the same change as the version bump
> (see AGENTS.md). The recent entries carry a "what to look for" so a new feature is easy to find.

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
