# Changelog

Every version is a deployed build and a GitHub Release. Newest first. 👀 = what to look for when
you play-test that version.

> Keep this current: every release adds an entry here in the same change as the version bump
> (see AGENTS.md). The recent entries carry a "what to look for" so a new feature is easy to find.

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
