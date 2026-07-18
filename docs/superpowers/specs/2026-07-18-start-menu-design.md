# Start menu + attract screen (v0.98.0)

## Goal
A front screen before free-roam: branding, a Play button, and quick picks (city, vehicle, mode),
over a **live city driving itself** (the existing autopilot) as the backdrop. The shell the arcade
modes (#5) and replay (#4) will later hang off.

## Decisions (brainstormed)
- **Designed splash + quick picks** (not a full launcher): logo, big Play, city search + 🎲 random,
  a compact vehicle strip, mode (Free / Trial / Race). Everything else stays in the ⚙ menu in-game.
- **Always show the menu**, with a **Continue** button when a saved session exists. A `?city=` link
  pre-fills the city as the backdrop but the menu still shows.
- **Backdrop = a live city on autopilot**, random each visit; picking/searching a city (or 🎲)
  reloads the backdrop to it, so **Play hands you the car you were watching**.

## State
A module-level `attract` flag in `main.ts`:
- **Boot → attract=true:** load a backdrop city (`?city=` if the link named one, else a random
  city), autopilot forced on, **player driving input suppressed**, the start-menu overlay shown.
- **Play → attract=false:** hide the menu, restore autopilot to the user's demo setting (off by
  default) so the player drives, enable input, apply the chosen vehicle + mode. The car is left
  where the autopilot had it (seamless) for Free roam; Trial/Race set their course.
- **Continue** (only when `getSession()`): load that city + pose straight into play, skipping the
  backdrop; autopilot off.

## Loop integration (small, low-risk)
- Driving input: `input = (pause.paused() || attract) ? ZERO : keyboard/touch`.
- Autopilot gate: `if ((autopilot.enabled() || attract) && !pause.paused()) …` — force autopilot
  while attract. Because player input is ZERO in attract, the existing "took the wheel → rehome"
  branch never fires, so the autopilot just drives the backdrop.

## Component `src/ui/startMenu.ts` (DOM overlay)
- Title **RACE THE CITY** (styled text, no art asset).
- **City**: search field (Enter → reload backdrop) + 🎲 Random.
- **Car**: a compact strip of ~6 popular vehicles + a "▾" that reveals the full grouped list;
  selection swaps the backdrop car live (reuses `onSelectVehicle`).
- **Mode**: Free / Time trial / Race — a local selection applied on Play (not toggled live, so the
  backdrop stays clean).
- **▶ PLAY** (large) + **Continue** (shown only if a session exists). ⚙ and ? remain reachable.
- Semi-transparent panel so it reads over both day and neon backdrops. Strings via the i18n table
  (new en/ru keys). Not a 3D mesh → no neon-coverage wiring needed.

Callbacks: `onPlay(vehicle, mode)`, `onContinue()`, `onCity(query)`, `onRandom()`,
`onVehicle(type)`, `onMode(mode)`. Handle: `show()`, `hide()`, `setContinueAvailable(bool)`.

## Testing
- The attract/input-suppression logic is pure and unit-tested: while attract, the resolved driving
  input is zero and autopilot is forced; on Play it clears. Extract a tiny helper if it reads
  cleaner than testing through the loop.
- The menu DOM is verified by a headless screenshot (as the mist wall was) + a human. `boot-check`
  must still pass (main.ts boot changed).

## Version
Minor — **v0.98.0**. CHANGELOG + FEATURES updated (a Start menu section; controls unchanged).

## Follow-ups
- Arcade modes (#5) plug a new mode button into the strip.
- Replay (#4) adds a "Watch last drive" entry.
