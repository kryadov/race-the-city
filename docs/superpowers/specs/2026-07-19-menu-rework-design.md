# Menu rework — one central menu (design)

Date: 2026-07-19. Status: approved by the user, ready to implement.

## Goal

Merge the two menu surfaces — the start **splash** (`src/ui/startMenu.ts`) and the in-game **⚙ side
menu** (`src/ui/settingsMenu.ts`) — into **one central menu** that opens both at start and on **Esc**
in-session. Keep the current start-menu look (the user likes it). Give it an **Options** sub-screen
that holds everything the old side menu held. Move the **game modes** into one **single-select** mode
picker on the main screen, killing the split/duplicated mode state.

## Why

Today the same concepts live twice, inconsistently:
- **Modes** are single-select on the splash (`StartMode = free|trial|race|taxi`) but **independent
  on/off toggles** in the side menu (`onArcade`/`onTrial`/`onRace`/`onDemo`), and **taxi is missing**
  from the side menu while **arcade/demo** are missing from the splash. You can turn on trial + race +
  arcade at once in-session — incoherent.
- **City** and **vehicle** pickers exist in *both* menus.
- Two components drift apart on every change.

## Design

### One component, two screens

New `src/ui/menu.ts` exports `createMenu(root, cb, initial): MenuHandle`. It owns a single overlay with
two screens; the old `startMenu.ts` and `settingsMenu.ts` are absorbed into it (deleted).

**Main screen** (keeps the current start-menu visual design — branded "RACE THE CITY" panel):
- City search 🔍 + 🎲 random
- Vehicle strip (POPULAR) + "▸ all cars" grid
- **Mode picker** — a single-select segmented control: `Free · Time-trial · Race · Taxi · 🕹 Find-a-car`
- `PLAY` (label becomes **Resume/Apply** when a session is live) · `Continue` (only when a saved session
  exists) · language quick-toggle · **⚙ Options** button

**Options screen** (separate screen, replaces the main content, has a **← Back**): every setting from
the old side menu, as the existing collapsible sections, minus what now lives on the main screen:
- **View & time** — view mode (normal/neon/…), time-of-day slider, time mode (cycle/day/night), shadows,
  clouds, drift FX, HUD, road detail, weather
- **Audio** — music/engine/volume via `onAudioChange`, custom-music upload (`onCustomMusic`)
- **Map & density** — road labels, quality, density, units, zoom, nitro toggle, fuel toggle
- **Location** — set-default-city, share-city, reset-location, full reset
- **Language** — EN/RU/…
- **About** — `v${__APP_VERSION__}`
- **Autopilot (demo)** toggle — `onDemo` lives here (it is a "watch it drive" toggle, not a play mode)

City and vehicle pickers are **removed** from Options (the main screen owns them).

### One mode model (single source of truth)

- New type `Mode = 'free' | 'trial' | 'race' | 'taxi' | 'arcade'` (replaces `StartMode`; add `arcade`).
- `main.ts` holds one `let mode: Mode` and one `applyMode(m: Mode)` that does what the scattered
  `applyTrial`/`applyTaxi`/`onArcade`/`onRace` handlers did, mutually exclusively: turning one on turns
  the others off (clear gates when leaving trial/race, stop the taxi meter, toggle arcade pickups).
- The menu's mode picker calls `cb.onMode(m)`; on Play it calls `cb.onPlay(m)`. In-session, picking a
  mode applies it live via `applyMode`.
- The side menu's independent `onArcade/onTrial/onRace` toggles and the `arcade/trial/race` init fields
  are **deleted** — mode is only ever the picker.

**Open point (defaulted):** Find-a-car is a mutually-exclusive mode in the picker. If the user later
wants "car pickups on top of any mode", it becomes a separate toggle in Options instead — a one-line
change (a `boolean arcadePickups` independent of `mode`). Shipping as an exclusive mode for now.

### Behaviour

- Esc toggles the menu; while open the sim pauses (as the ⚙ menu does today) and the backdrop is the
  paused game. At start (attract), the backdrop is the autopilot city, same as now.
- The menu is the SAME on both entry points; only `PLAY`→`Resume/Apply` and the presence of `Continue`
  differ, driven by `initial.hasSession` / a `setSessionLive(on)` handle method.
- City/vehicle changes behave exactly as today (reload backdrop / swap car live).

### Interface (sketch)

```ts
export type Mode = 'free' | 'trial' | 'race' | 'taxi' | 'arcade'

export interface MenuCallbacks {
  onPlay(mode: Mode): void        // Play / Resume
  onContinue(): void
  onCity(query: string): void
  onRandom(): void
  onVehicle(type: VehicleType): void
  onMode(mode: Mode): void        // applied live in-session
  // ...all the old SettingsCallbacks for the Options screen (view/audio/map/location/lang/reset/demo)
}
export interface MenuHandle {
  open(): void; close(): void; toggle(): void; visible(): boolean
  setSessionLive(on: boolean): void          // PLAY<->Resume + Continue availability
  setVehicle(type: VehicleType): void
  setCity(query: string): void
  setMode(mode: Mode): void
  setViewMode(m: ViewMode): void; setTrial(on: boolean): void; setTime(t: number): void; setZoom(v: number): void
  revealCity(): void; enterLoading(): void   // backdrop handoff (from startMenu today)
}
```

## Files

- **New** `src/ui/menu.ts` — the unified component (main + options screens). Reuses the existing widget
  helpers/styles from the two old files so the look is preserved.
- **Delete** `src/ui/startMenu.ts`, `src/ui/settingsMenu.ts` (their content folds into `menu.ts`).
- `src/app/main.ts` — one `createMenu` instance replacing both `createStartMenu` + `createSettingsMenu`;
  centralize `mode` + `applyMode`; wire Esc to `menu.toggle()`; delete the scattered mode handlers.
- Tests: `test/ui/menu.test.ts` (new) covering the mode picker single-select, main↔options navigation,
  and `setSessionLive`. Old `startMenu`/`settingsMenu` tests migrate/rename if present.

## Implementation plan

1. Create `src/ui/menu.ts` with the main screen (port startMenu's layout + widgets), the mode picker
   (single-select over `Mode`), and the `⚙ Options` button.
2. Add the Options screen: port every settings section from `settingsMenu.ts` (minus city/vehicle/modes),
   with a `← Back` that returns to the main screen. Preserve section keys/i18n and collapse memory.
3. Define `MenuCallbacks`/`MenuHandle`; keep method names close to the old ones to minimize wiring churn.
4. Wire `main.ts`: replace both constructors with `createMenu`; introduce `mode: Mode` + `applyMode`;
   route the old start/settings callbacks through it; Esc → `menu.toggle()`; `setSessionLive` on
   session start/end.
5. Delete `startMenu.ts` + `settingsMenu.ts`; fix imports; add `menu.test.ts`.
6. Verify: `tsc` clean, `vitest` green, `npm run build`, `boot-check` OK (main.ts changed — mandatory).
7. Ship as a minor release (a new top-level UX): version bump + CHANGELOG + the release ritual.

## Testing

- `menu.test.ts`: mode picker is single-select and calls `onMode`; `⚙ Options`→Back navigation swaps
  screens; `setSessionLive(true)` flips PLAY→Resume and reveals Continue; language toggle switches copy.
- Manual (boot-check + a play-test): Esc opens the same menu in-session; Options holds all old settings;
  every mode reachable and mutually exclusive.

## Out of scope (tracked separately in TODO.md)

Visual restyle beyond preserving the current look; the archways/traffic/ground-surface/start-position
bugs (their own items, some fanned out to parallel agents).
