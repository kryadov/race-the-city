# Race the City — features & how to play

Free-roam driving around a **real city**, built on the fly from OpenStreetMap geometry over
real elevation. Type a city (or roll a random one) and drive. No install, no backend — it all
runs in the browser.

> Keep this file current: when you add a feature or change an existing one, update the relevant
> section here in the same change (see AGENTS.md).

---

## Start screen

On load you get a **start menu** — RACE THE CITY — over a real city driving itself on autopilot.
Pick a **city** (search or 🎲 random — the backdrop reloads to it), a **car** (a quick strip, or
"More…" for all 19), and a **mode** (Free roam / Time trial / Race), then **▶ Play** to take the
wheel of the car you were watching. If you've played before, **Continue** resumes your saved
session. A `?city=` share link pre-fills the city.

---

## Controls

**Drive (keyboard)** — matched by physical key position, so WASD and the hotkeys work on any
keyboard layout (Cyrillic, AZERTY, …), not just QWERTY.
- **W / ↑** — accelerate · **S / ↓** — brake / reverse
- **A / ←** — steer left · **D / →** — steer right
- **Space** — handbrake (slide it into a drift)
- **H** — horn (hold) — sounds different per vehicle (a lorry blasts, a bike squeaks); nearby
  traffic and pedestrians step aside when you honk

**View & UI**
- **V** — toggle the neon / wireframe look
- **+ / =** — zoom in · **- / _** — zoom out (or the camera slider in the menu)
- **Esc** — pause (or the ⏸ button); **⚙** — settings; **ℹ️ About** (with a ❤️ Support link);
  **?** — controls help overlay

**Touch** — on-screen steering + pedals appear on touch devices.

The camera is a chase cam that pulls in near buildings and inside tunnels, pitches on hills and
banks in corners.

---

## Where you drive

- **Search any city** by name, or `City, Country`, or `lat,lon` for an exact spot.
- **🎲 Random city** — a curated list across the world's regions.
- **Shareable link** — the city rides in the URL (`?city=…`), so a link drops someone into the
  same place.
- **Session saved** — your city, car and pose are remembered; a reset-location button puts you
  back on the start line without a reload.
- Loading shows a **progress bar**, retries a flaky fetch up to 3 times, and caches the map so a
  revisit is instant.
- **The world has an edge** — a marked boundary rings the map; drive to it and the car eases to
  a stop against a wall of mist rather than sailing off into nothing.

---

## Vehicles

**19 vehicle types**, in a grouped, collapsible picker (by purpose): everyday cars, a leaning
motorbike, off-roaders incl. a **jeep** (4×4 grip, high top speed), a truck and tanker, a
tractor + tiller that **pulls a trailer with its driver on it**, and oddballs — crane, minivan,
tracked ATV, hovercar, EV, retro, roller, combine.

Each vehicle has:
- its own **engine sound** (diesel / petrol / race / small / electric / turbine), which **fades
  out after ~10s parked** and returns on the throttle;
- **headlights** (a spotlight that brightens at night), **tail lights**, **brake lights**, and
  **turn signals** with fender repeaters and a soft **relay tick-tock** while they flash;
- **steered wheels** that turn with your input (a combine steers on its rear, a tracked hull on
  neither), and visible **glass** on enclosed cabs;
- a **nitro flame** from the exhaust when boosting.

Physics is arcade drift: tyre grip lets the tail slide, brakes never reverse you, and **jumps**
have real gravity — crest a ramp and you launch; come off a **roof or the end of a high bridge**
and you fly off the lip in an arc instead of dropping through it. Launch off something **hard
enough** and the car **flips through the air** and rights itself to land back on its wheels — a
gentle hop just stays level. You can **land on a roof and drive along it**, and clear a bungalow,
fountain or statue mid-jump.

---

## Gameplay modes

- **Free roam** — just drive.
- **Taxi** — pick a passenger up at the glowing green marker, deliver them to the amber marker
  before the meter runs out, then on to the next fare — a chaining shift, your score climbing with
  every drop-off. Fares and score show under the minimap. The load **rides on your vehicle** while a
  fare is aboard, typed to what you're driving — a **passenger** in a car (a smartly-dressed one in a
  sports car), **sand** in a pickup tray, **gravel** on a truck, **fuel** on a tanker, **milk** on a
  tractor.
- **Excursion** (🗺) — tour the city's **landmarks** (museums, monuments, memorials, castles,
  viewpoints): drive to each before the clock runs out, chasing a single **gold beam of light** over
  the current sight (and the minimap arrow), your count of sights seen climbing as you go.
- **Cops & Robbers** (🚓) — two **AI police cars** hunt you down through the streets, re-routing to
  wherever you are. **Evade** them for the timer to escape (score +1); let one within a few metres and
  you're **busted**. A fast car and tight corners are your friends. HUD shows the timer + nearest cop.
- **Time trial** — gates, a lap clock, and your best lap kept between sessions. A checkpoint
  chime marks each gate; **fireworks** when you finish a lap.
- **Traffic lights** — signals at busy junctions, and the **bot cars obey them**: they stop at a red
  and pull away on green (the streets never gridlock — a held car always gets its turn).
- **Races with rivals** — three AI cars run the gate course on A\* routes over the road graph,
  through the same physics as you; the HUD shows your place.
- **Demo / autopilot** — a menu toggle drives the car for you around the road network (also the
  attract-mode backdrop).
- **Pickups** — **nitro** speed boosts and **petrol cans** scattered on the roads; run low on
  fuel and the car slows until you grab a can — and **heavier vehicles drink faster** (a lorry
  empties its tank well before a hatchback), with a **burn-rate cycle in ⚙ Options** (off / ×0.5 /
  ×1 / ×1.6). Nitro comes **colour-coded**: **blue** is the
  balanced standard, **red** a short hard punch (faster, but brief), **green** a long gentle
  push — the colour tells you what kind of boost you're grabbing.
- **Record & replay** — a **REC** button (bottom-centre, in-game) records your drive; **Replay**
  retraces it with the camera following. Changing city clears the recording.

---

## The living world

Built from the real map around you:
- **Roads** with lane markings, kerbs, street lamps, signs; **drivable bridges** (profiled decks
  with railings, piers, lamps) that meet the ground at both ends; tunnels the camera pulls into.
- **Buildings** read by type — houses, apartments, retail, office, industrial, civic — with
  windows, doors and signage, and **glowing windows at night**.
- **Water** — rivers (incl. big multipolygon rivers like the Neva), reservoirs, and a flat sea
  along the coast, with **boats, ships, yachts and sailing boats** sized to the water available.
  **Islands** in a river or lake read as land — the water is cut around them, not painted over.
- **Greenery** — parks, woods and grass, with **trees whose kind follows latitude** (palms in
  the Mediterranean band, firs up north) and a **real spread of heights** — saplings and shrubs
  through to the odd giant, so a stand reads as a mix rather than one cloned size — plus fountains,
  statues and flowerbeds.
- **Parking** tarmac with painted bays, filled with parked cars — and a few of them **come alive**:
  they pull out of a bay and drive off, others arrive and park (all within the lot), and **someone
  gets in and out** — a figure boards a car before it leaves and steps out when one arrives.
  Drive the **🌾 combine** across a **farmland field** and it **mows** a swathe — standing crop turns
  to stubble in your wake, with the odd **hay bale** left behind. **Sports pitches** (`leisure=pitch`)
  with goals or a basketball hoop, a few players and a ball; **cycle-lane stripes** along bike routes.
  **Manhole covers** dotted down the streets; **benches**
  (some with someone sat on them), **bus stops**, and **café / fuel signposts** at those spots.
  **Landmarks** (museums, monuments, memorials, castles, viewpoints) get their own signpost.
- **Archways** — where a road or railway runs straight through a building, the passage is opened
  (drivable — the car and bots go through, not into a wall) and a **stone arch** stands over it.
- **Railways** with **trains** — freight, intercity, commuter — running the real lines out of
  and into tunnel mouths.
- **Traffic and pedestrians** walking the road graph and pavements around you; **livestock** on
  farmland; **aircraft** crossing the sky (airliner, bizjet, turboprop, helicopter); **birds**
  wheeling in a flock and perching.

---

## Visuals & atmosphere

- **Day/night cycle** with a gradient sky, sun disc, **stars and a moon** at night. Lock it to
  **perpetual day** or **perpetual night** in ⚙ Options — the sky still **breathes** gently (the sun
  eases a little and back) but never crosses into the other half.
- **Weather** — clear, rain, snow, fog — on a menu toggle or auto-cycling, with matching cloud
  cover and clouds you can toggle. On **Auto**, a city starts with its **real current weather**
  (fetched live from Open-Meteo), then drifts through the cycle from there.
- **Neon mode** (V) — the whole city turns to glowing wireframe over a dark world — buildings,
  roads, greenery, and everything that moves too: your car glows white, the bots (traffic, buses,
  bikes, cyclists, pedestrians, trains, boats, livestock, birds, aircraft) glow amber.
- **Shadows** (sun shadow map, follows the car) and **street lights** with light pools at night.
- Low-poly, flat-shaded style throughout; **low / normal / high** rendering tiers.

---

## Audio

- **Music** on by default — real tracks, random on start and when one ends; or **upload your own**
  audio file to loop.
- Per-vehicle **engine** sound, **horn** (H), tyre **skid**, and a **checkpoint chime**.

---

## UI / UX

- **Speedometer / HUD** — km/h gauge, odometer, km or miles; sized to match the minimap.
- **Minimap** of roads, buildings, water and greenery around you.
- **Settings menu** (⚙) with collapsible groups: city, vehicle, weather, quality, shadows,
  camera zoom, road detail, HUD, road labels, units, language, and more.
- **Language** — English and Russian today (more planned).
- **Pause** (Esc), **controls help** (?), a **version badge**, and an **update notice** when a
  new build deploys (dismiss sticks).

---

## Running it

See `AGENTS.md` for the dev/build/test commands. In short: `npm install`, `npm run dev` to play
locally, `npm run build` to produce the static site.
