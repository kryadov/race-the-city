# Ten More Vehicles + Grouped Picker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ten vehicle types (crane, minivan, tracked, hover, ev, retro, tanker, tiller, roller, combine) and group the settings-menu vehicle picker into four collapsible groups by purpose.

**Architecture:** `VehicleType` is a string-union feeding four exhaustive `Record<VehicleType, …>` maps (`VEHICLES`, `STOP_STYLE`, `BUILDERS`, `VEHICLE_EMOJI`). Adding a type breaks compilation until all four are filled, so tasks are cut **per vehicle family** — each task adds types and fills every map, staying green. `model.ts` (357 lines / 9 models) is split into `models/` first so the new builders land in focused files. Group membership is data (`VEHICLE_GROUPS`), so the menu never names a vehicle.

**Tech Stack:** Vite + TypeScript + Three.js, vitest, plain DOM (no framework).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-16-vehicle-groups-design.md`.
- Ships as **one release, v0.58.0** (minor = feature). Version lives in `package.json`.
- Two languages, both required for every label: `en` and `ru` in `src/i18n/i18n.ts`.
- Models point **+x** (heading 0 faces +x); units are metres.
- `buildVehicleMesh(type: VehicleType): THREE.Group` keeps its signature — no consumer changes.
- Wheel spin is automatic: any group tagged `userData.wheelRadius` is rotated by `syncCamera`. A wheel-less model simply has no tagged groups; no code change.
- `HOVER_H = 1.0` m.
- Verify with `npx tsc --noEmit` and `npx vitest run` before every commit.
- Follow the release process: work on `master`, then ff `main`, then tag (Task 8 only).

---

### Task 1: Split `model.ts` into `models/` (pure refactor)

Behaviour must not change. This is groundwork so the ten new builders don't land in a 700-line file.

**Files:**
- Create: `src/vehicle/models/parts.ts` (shared primitives + materials)
- Create: `src/vehicle/models/cars.ts` (buildCar, buildSports, buildRaceCar, buildCabrio)
- Create: `src/vehicle/models/trucks.ts` (buildTruck, buildLorry, buildBus)
- Create: `src/vehicle/models/special.ts` (buildTractor)
- Create: `src/vehicle/models/exotic.ts` (buildMotorbike)
- Modify: `src/vehicle/model.ts` (becomes a thin barrel: STOP_STYLE, BUILDERS, buildVehicleMesh, re-exports)
- Test: `test/vehicle/model.test.ts`

**Interfaces:**
- Consumes: `VehicleType`, `VEHICLE_TYPES` from `src/vehicle/vehicles.ts`.
- Produces:
  - `parts.ts` exports: `box(w,h,d,color,x,y,z): THREE.Mesh`, `wheel(radius,width,x,y,z): THREE.Object3D`, `fourWheels(radius,width,axleX,halfTrack,y): THREE.Object3D[]`, `light(x,y,z): THREE.Mesh`, `lens(mat,w,h,surfX,y,z,face): THREE.Mesh`, `housingBar(h,w,surfX,y,z,face): THREE.Mesh`, `glass(w,h,d,x,y,z): THREE.Mesh`, `person(x,y,z,helmet,legs): THREE.Object3D`, `repeater(mat,x,y,z): THREE.Mesh`, `mirror(x,y,zBody,out): THREE.Object3D`, and materials `REAR_LIGHT_MAT`, `TURN_LEFT_MAT`, `TURN_RIGHT_MAT`, `REAR_LIGHT_IDLE`, `REAR_LIGHT_BRAKE`.
  - `model.ts` keeps exporting `buildVehicleMesh`, `REAR_LIGHT_MAT`, `TURN_LEFT_MAT`, `TURN_RIGHT_MAT`, `REAR_LIGHT_IDLE`, `REAR_LIGHT_BRAKE` (re-exported from `parts.ts`) so `src/app/main.ts` imports keep working unchanged.

- [ ] **Step 1: Write the failing test**

Create `test/vehicle/model.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildVehicleMesh } from '../../src/vehicle/model'
import { VEHICLE_TYPES } from '../../src/vehicle/vehicles'

describe('vehicle models', () => {
  it('builds a mesh for every declared type', () => {
    for (const type of VEHICLE_TYPES) {
      const mesh = buildVehicleMesh(type)
      expect(mesh, type).toBeInstanceOf(THREE.Group)
      expect(mesh.children.length, type).toBeGreaterThan(0)
    }
  })

  it('gives every wheeled vehicle spinnable wheels', () => {
    // syncCamera spins anything tagged wheelRadius; without the tag a model looks frozen.
    for (const type of VEHICLE_TYPES) {
      let wheels = 0
      buildVehicleMesh(type).traverse((o) => {
        if ((o.userData as { wheelRadius?: number }).wheelRadius) wheels++
      })
      expect(wheels, type).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: Run it — it must pass BEFORE the refactor**

Run: `npx vitest run test/vehicle/model.test.ts`
Expected: PASS (2 tests). This is the safety net that proves the refactor changed nothing.

- [ ] **Step 3: Create `src/vehicle/models/parts.ts`**

Move lines 4–186 of `src/vehicle/model.ts` (everything from the `// Models point +x` comment down to and including `mirror()`, i.e. every shared primitive and material) into the new file **except** `STOP_STYLE`, which stays in `model.ts`. Add `export` to each moved declaration: `box`, `wheel`, `fourWheels`, `light`, `lens`, `housingBar`, `glass`, `person`, `repeater`, `mirror`, `HEADLIGHT_MAT`, `HOUSING_MAT`, `MIRROR_MAT`, `GLASS_MAT`, `SKIN_MAT`, `SHIRT_MAT`, `TROUSER_MAT`, `HELMET_MAT`, `LENS_D`, `HOUSING_D`, `LENS_PROUD`, `HOUSING_PROUD`. Keep the existing `export` on `REAR_LIGHT_IDLE`, `REAR_LIGHT_BRAKE`, `REAR_LIGHT_MAT`, `TURN_LEFT_MAT`, `TURN_RIGHT_MAT`. The file starts with `import * as THREE from 'three'`.

- [ ] **Step 4: Create the four family files**

Each starts with:

```ts
import * as THREE from 'three'
import {
  box, wheel, fourWheels, light, lens, housingBar, glass, person, repeater, mirror,
  REAR_LIGHT_MAT, TURN_LEFT_MAT, TURN_RIGHT_MAT,
} from './parts'
```

(trim the import list to what each file actually uses — an unused import fails `tsc`)

Move the builder bodies verbatim, adding `export`:
- `cars.ts`: `buildCar` (model.ts:188-207), `buildSports` (232-252), `buildRaceCar` (293-309), `buildCabrio` (356-373)
- `trucks.ts`: `buildTruck` (209-230), `buildBus` (273-291), `buildLorry` (332-354)
- `special.ts`: `buildTractor` (311-330)
- `exotic.ts`: `buildMotorbike` (254-271)

- [ ] **Step 5: Rewrite `src/vehicle/model.ts` as the barrel**

```ts
import * as THREE from 'three'
import type { VehicleType } from './vehicles'
import { buildCar, buildSports, buildRaceCar, buildCabrio } from './models/cars'
import { buildTruck, buildBus, buildLorry } from './models/trucks'
import { buildTractor } from './models/special'
import { buildMotorbike } from './models/exotic'
import { REAR_LIGHT_MAT } from './models/parts'

export {
  REAR_LIGHT_MAT, TURN_LEFT_MAT, TURN_RIGHT_MAT, REAR_LIGHT_IDLE, REAR_LIGHT_BRAKE,
} from './models/parts'

// Per-vehicle stop-light colour so the cluster reads as part of the car's style.
const STOP_STYLE: Record<VehicleType, { color: number; emissive: number }> = {
  car: { color: 0x5a0000, emissive: 0xff1400 }, // classic red
  truck: { color: 0x5a1e00, emissive: 0xff5a00 }, // amber-red
  sports: { color: 0x4a0022, emissive: 0xff0055 }, // magenta LED
  motorbike: { color: 0x5a0000, emissive: 0xff2a00 },
  bus: { color: 0x5a1200, emissive: 0xff4400 },
  racecar: { color: 0x4a0010, emissive: 0xff0033 }, // single bright rain light
  tractor: { color: 0x5a2400, emissive: 0xff6a00 },
  lorry: { color: 0x5a1e00, emissive: 0xff5a00 },
  cabrio: { color: 0x50002a, emissive: 0xff1466 },
}

const BUILDERS: Record<VehicleType, () => THREE.Group> = {
  car: buildCar,
  truck: buildTruck,
  sports: buildSports,
  motorbike: buildMotorbike,
  bus: buildBus,
  racecar: buildRaceCar,
  tractor: buildTractor,
  lorry: buildLorry,
  cabrio: buildCabrio,
}

export function buildVehicleMesh(type: VehicleType): THREE.Group {
  const s = STOP_STYLE[type] // tint the shared stop material to match this vehicle
  REAR_LIGHT_MAT.color.setHex(s.color)
  REAR_LIGHT_MAT.emissive.setHex(s.emissive)
  return BUILDERS[type]()
}
```

- [ ] **Step 6: Verify the refactor changed nothing**

Run: `npx tsc --noEmit` — expected: no output.
Run: `npx vitest run` — expected: all suites pass, including the 2 new model tests.
Run: `npm run build` — expected: `✓ built`.

- [ ] **Step 7: Commit**

```bash
git add src/vehicle/model.ts src/vehicle/models test/vehicle/model.test.ts
git commit -m "refactor: split vehicle models into models/ per family

Groundwork for ten more vehicles: 357 lines for 9 models would become ~700.
Shared primitives move to models/parts.ts; builders group by family. model.ts
stays a thin barrel, so buildVehicleMesh and the light materials keep their
existing import paths. No behaviour change.

Adds test/vehicle/model.test.ts as the safety net for the move."
```

---

### Task 2: Data-driven groups + nested collapsible picker (still 9 vehicles)

**Files:**
- Modify: `src/vehicle/vehicles.ts` (add `VEHICLE_GROUPS`)
- Modify: `src/ui/settingsMenu.ts:144` (`section` gains a `parent` param), `:245-258` (picker loops groups)
- Modify: `src/i18n/i18n.ts` (4 group labels × 2 languages)
- Test: `test/vehicle/vehicles.test.ts`, `test/i18n/i18n.test.ts`

**Interfaces:**
- Consumes: `VehicleType`, `VEHICLE_TYPES`.
- Produces: `VEHICLE_GROUPS: readonly { key: string; types: readonly VehicleType[] }[]` — `key` is an i18n key. Task 3–7 append types to these groups.

- [ ] **Step 1: Write the failing test**

Create `test/vehicle/vehicles.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { VEHICLE_TYPES, VEHICLE_GROUPS, VEHICLES } from '../../src/vehicle/vehicles'

describe('vehicle groups', () => {
  it('covers every type exactly once', () => {
    const grouped = VEHICLE_GROUPS.flatMap((g) => g.types)
    expect([...grouped].sort()).toEqual([...VEHICLE_TYPES].sort())
    expect(new Set(grouped).size, 'a type appears in two groups').toBe(grouped.length)
  })

  it('gives every type a spec keyed to itself', () => {
    for (const type of VEHICLE_TYPES) {
      expect(VEHICLES[type], type).toBeDefined()
      expect(VEHICLES[type].key, type).toBe(type)
    }
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/vehicle/vehicles.test.ts`
Expected: FAIL — `VEHICLE_GROUPS` is not exported from `vehicles.ts`.

- [ ] **Step 3: Add `VEHICLE_GROUPS` to `src/vehicle/vehicles.ts`**

Append after `VEHICLE_TYPES` (keep `VEHICLE_TYPES` as-is — it stays the flat source of truth):

```ts
/**
 * Menu grouping, by what the thing is for. The picker renders these in order and
 * never names a vehicle itself, so adding a type is one line here.
 */
export const VEHICLE_GROUPS: readonly { key: string; types: readonly VehicleType[] }[] = [
  { key: 'vehGroup.cars', types: ['car', 'sports', 'racecar', 'cabrio'] },
  { key: 'vehGroup.trucks', types: ['truck', 'lorry', 'bus'] },
  { key: 'vehGroup.special', types: ['tractor'] },
  { key: 'vehGroup.exotic', types: ['motorbike'] },
]
```

- [ ] **Step 4: Add the group labels to `src/i18n/i18n.ts`**

In the `en` block, next to the `vehicle.*` keys:

```ts
    'vehGroup.cars': 'Cars',
    'vehGroup.trucks': 'Trucks',
    'vehGroup.special': 'Special',
    'vehGroup.exotic': 'Exotic',
```

In the `ru` block:

```ts
    'vehGroup.cars': 'Легковые',
    'vehGroup.trucks': 'Грузовые',
    'vehGroup.special': 'Спецтехника',
    'vehGroup.exotic': 'Особые',
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run test/vehicle/vehicles.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Generalise `section()` to accept a parent**

In `src/ui/settingsMenu.ts`, change the signature at line 144 and the append at line 171:

```ts
  function section(key: string, parent: HTMLElement = panel): HTMLDivElement {
```

and replace `panel.appendChild(wrap)` with:

```ts
    parent.appendChild(wrap)
```

Everything else in `section` stays. Existing calls pass no parent, so they still append to the panel.

- [ ] **Step 7: Render the picker from the groups**

Replace `src/ui/settingsMenu.ts:245-258` (the `// --- Vehicle ---` block) with:

```ts
  // --- Vehicle ---
  const vehSec = section('menu.vehicle')
  const vehButtons = new Map<VehicleType, HTMLButtonElement>()
  for (const group of VEHICLE_GROUPS) {
    const groupBody = section(group.key, vehSec)
    const groupRow = row()
    for (const type of group.types) {
      const b = button()
      b.addEventListener('click', () => {
        cb.onSelectVehicle(type)
        setVehicle(type)
      })
      vehButtons.set(type, b)
      groupRow.appendChild(b)
    }
    groupBody.appendChild(groupRow)
  }
```

Update the import at line 2:

```ts
import { VEHICLE_GROUPS, type VehicleType } from '../vehicle/vehicles'
```

(`VEHICLE_TYPES` is no longer used here — leaving it imported fails `tsc`.)

`paintStates` at :501-504 already loops `vehButtons`, so it keeps working. Group headers are labelled by the existing `labels.push({ el: lbl, key })` inside `section`, so they translate on language change for free.

- [ ] **Step 8: Verify**

Run: `npx tsc --noEmit` — expected: no output.
Run: `npx vitest run` — expected: all pass.
Run: `npm run build` — expected: `✓ built`.

- [ ] **Step 9: Commit**

```bash
git add src/vehicle/vehicles.ts src/ui/settingsMenu.ts src/i18n/i18n.ts test/vehicle/vehicles.test.ts
git commit -m "feat: group the vehicle picker into collapsible groups

Nineteen vehicles will not fit a flat row. Group them by purpose, driven by
VEHICLE_GROUPS data so the menu never names a vehicle. section() now takes a
parent, letting groups nest inside the Vehicle section and reuse the existing
collapse + rtc.menuOpen persistence from v0.57.0.

Two groups hold one vehicle each for now; the next commits fill them."
```

---

### Task 3: Car family — retro, ev, minivan

**Files:**
- Modify: `src/vehicle/vehicles.ts` (3 types, 3 specs, group), `src/vehicle/model.ts` (STOP_STYLE, BUILDERS), `src/vehicle/models/cars.ts` (3 builders), `src/ui/settingsMenu.ts:14` (emoji), `src/i18n/i18n.ts` (labels)
- Test: existing `test/vehicle/vehicles.test.ts`, `test/vehicle/model.test.ts`, `test/i18n/i18n.test.ts` cover these automatically.

**Interfaces:**
- Consumes: `parts.ts` primitives from Task 1; `VEHICLE_GROUPS` from Task 2.
- Produces: types `'retro' | 'ev' | 'minivan'`; builders `buildRetro`, `buildEv`, `buildMinivan` exported from `models/cars.ts`.

- [ ] **Step 1: Write the failing test**

Add to `test/vehicle/vehicles.test.ts`:

```ts
import { VEHICLE_TYPES as TYPES } from '../../src/vehicle/vehicles'

it('includes the requested car-family types', () => {
  for (const t of ['retro', 'ev', 'minivan']) expect(TYPES).toContain(t)
})
```

Add to `test/i18n/i18n.test.ts` (`i18n.ts:190` — `t()` returns the key itself for an unknown
key, which is exactly what this asserts against; `LANGS` is `readonly Lang[]` = `['en','ru']`):

```ts
import { VEHICLE_TYPES } from '../../src/vehicle/vehicles'
import { LANGS, setLang, t } from '../../src/i18n/i18n'

it('labels every vehicle and group in every language', () => {
  for (const lang of LANGS) {
    setLang(lang)
    for (const key of [
      ...VEHICLE_TYPES.map((v) => 'vehicle.' + v),
      'vehGroup.cars', 'vehGroup.trucks', 'vehGroup.special', 'vehGroup.exotic',
    ]) {
      expect(t(key), `${lang}/${key}`).not.toBe(key) // key echoed back = translation missing
    }
  }
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/vehicle/vehicles.test.ts test/i18n/i18n.test.ts`
Expected: FAIL — `'retro'` not in `VEHICLE_TYPES`.

- [ ] **Step 3: Add the types, specs and group entries**

In `src/vehicle/vehicles.ts`, extend the union on line 1:

```ts
export type VehicleType =
  | 'car' | 'truck' | 'sports' | 'motorbike' | 'bus' | 'racecar' | 'tractor' | 'lorry' | 'cabrio'
  | 'retro' | 'ev' | 'minivan'
```

Add to `VEHICLE_TYPES` after `'cabrio'`: `'retro', 'ev', 'minivan',`

Add to `VEHICLES`:

```ts
  // A 60s cruiser: soft springs, weak brakes, slides if you push it.
  retro: {
    key: 'retro', accel: 60, brakeAccel: 52, dragForward: 2.0, gripLateral: 4.6,
    turnRate: 2.2, turnSpeedRef: 8, maxSpeed: 34, maxReverse: 11, radius: 1.35,
  },
  // Electric: instant torque off the line, modest top end, grips well.
  ev: {
    key: 'ev', accel: 130, brakeAccel: 80, dragForward: 2.0, gripLateral: 7.2,
    turnRate: 2.5, turnSpeedRef: 7.5, maxSpeed: 44, maxReverse: 14, radius: 1.3,
  },
  // A people carrier: tall, unhurried, safe.
  minivan: {
    key: 'minivan', accel: 62, brakeAccel: 60, dragForward: 1.9, gripLateral: 5.5,
    turnRate: 2.0, turnSpeedRef: 9, maxSpeed: 36, maxReverse: 12, radius: 1.6,
  },
```

Update the cars group:

```ts
  { key: 'vehGroup.cars', types: ['car', 'sports', 'racecar', 'cabrio', 'retro', 'ev', 'minivan'] },
```

- [ ] **Step 4: Add the builders to `src/vehicle/models/cars.ts`**

```ts
/** A 60s cruiser: tall cabin, rounded wings, whitewall-ish fat wheels. */
export function buildRetro(): THREE.Group {
  const g = new THREE.Group()
  const body = 0x2f6f4f // deep green
  g.add(box(4.5, 0.5, 1.85, body, 0, 0.62, 0)) // low body pan
  g.add(box(2.9, 0.42, 1.8, body, -0.1, 1.0, 0)) // waist
  g.add(box(1.9, 0.6, 1.6, 0xdfe4e8, -0.25, 1.42, 0)) // tall greenhouse
  g.add(glass(0.1, 0.44, 1.45, 0.68, 1.42, 0)) // windscreen
  g.add(box(0.7, 0.3, 1.9, body, 1.95, 0.86, 0)) // rounded nose
  g.add(box(0.5, 0.28, 1.9, body, -2.05, 0.86, 0)) // boot
  g.add(...fourWheels(0.52, 0.42, 1.4, 0.95, 0.52))
  g.add(light(2.28, 0.9, 0.62), light(2.28, 0.9, -0.62))
  const rx = -2.28, fx = 2.28
  g.add(housingBar(0.4, 1.7, rx, 0.9, 0, -1))
  g.add(lens(REAR_LIGHT_MAT, 0.4, 0.28, rx, 0.9, 0.55, -1), lens(REAR_LIGHT_MAT, 0.4, 0.28, rx, 0.9, -0.55, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.22, 0.2, rx, 0.9, 0.85, -1), lens(TURN_LEFT_MAT, 0.22, 0.2, rx, 0.9, -0.85, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.2, 0.2, fx, 0.86, 0.86, 1), lens(TURN_LEFT_MAT, 0.2, 0.2, fx, 0.86, -0.86, 1))
  g.add(repeater(TURN_RIGHT_MAT, 1.35, 0.95, 0.94), repeater(TURN_LEFT_MAT, 1.35, 0.95, -0.94))
  g.add(mirror(0.85, 1.3, 0.94, 1), mirror(0.85, 1.3, -0.94, -1))
  return g
}

/** Electric: smooth one-box shape, no grille, a light bar across the nose. */
export function buildEv(): THREE.Group {
  const g = new THREE.Group()
  const body = 0xe8eef2 // pearl white
  g.add(box(4.3, 0.62, 1.85, body, 0, 0.62, 0))
  g.add(box(3.1, 0.52, 1.78, body, -0.15, 1.16, 0)) // smooth cabin
  g.add(glass(0.1, 0.4, 1.6, 1.3, 1.2, 0)) // steep windscreen
  g.add(glass(0.1, 0.36, 1.6, -1.68, 1.2, 0)) // rear screen
  g.add(...fourWheels(0.46, 0.34, 1.42, 0.94, 0.46))
  // full-width light bar instead of separate headlights
  g.add(light(2.12, 0.82, 0.5), light(2.12, 0.82, 0), light(2.12, 0.82, -0.5))
  const rx = -2.12, fx = 2.12
  g.add(housingBar(0.26, 1.86, rx, 0.86, 0, -1))
  g.add(lens(REAR_LIGHT_MAT, 0.26, 1.5, rx, 0.86, 0, -1)) // single bar
  g.add(lens(TURN_RIGHT_MAT, 0.2, 0.18, rx, 0.6, 0.82, -1), lens(TURN_LEFT_MAT, 0.2, 0.18, rx, 0.6, -0.82, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.18, 0.16, fx, 0.6, 0.84, 1), lens(TURN_LEFT_MAT, 0.18, 0.16, fx, 0.6, -0.84, 1))
  g.add(repeater(TURN_RIGHT_MAT, 1.3, 0.9, 0.94), repeater(TURN_LEFT_MAT, 1.3, 0.9, -0.94))
  g.add(mirror(0.8, 1.24, 0.94, 1), mirror(0.8, 1.24, -0.94, -1))
  return g
}

/** A people carrier: one tall box, sliding-door line, small wheels. */
export function buildMinivan(): THREE.Group {
  const g = new THREE.Group()
  const body = 0x8f6fc0 // muted violet
  g.add(box(4.6, 0.66, 1.95, body, 0, 0.66, 0))
  g.add(box(3.9, 0.94, 1.9, body, -0.2, 1.44, 0)) // tall cabin
  g.add(glass(0.1, 0.6, 1.7, 1.72, 1.5, 0)) // big windscreen
  g.add(glass(0.08, 0.5, 1.7, -2.12, 1.5, 0)) // tailgate glass
  g.add(box(0.06, 0.7, 0.06, 0x3a3a44, 0.2, 1.4, 0.97)) // sliding-door rail, right
  g.add(box(0.06, 0.7, 0.06, 0x3a3a44, 0.2, 1.4, -0.97))
  g.add(...fourWheels(0.44, 0.36, 1.5, 0.98, 0.44))
  g.add(light(2.3, 0.82, 0.66), light(2.3, 0.82, -0.66))
  const rx = -2.32, fx = 2.3
  g.add(housingBar(0.8, 1.86, rx, 1.3, 0, -1))
  g.add(lens(REAR_LIGHT_MAT, 0.7, 0.24, rx, 1.3, 0.78, -1), lens(REAR_LIGHT_MAT, 0.7, 0.24, rx, 1.3, -0.78, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.22, 0.2, rx, 0.86, 0.8, -1), lens(TURN_LEFT_MAT, 0.22, 0.2, rx, 0.86, -0.8, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.2, 0.18, fx, 0.6, 0.88, 1), lens(TURN_LEFT_MAT, 0.2, 0.18, fx, 0.6, -0.88, 1))
  g.add(repeater(TURN_RIGHT_MAT, 1.45, 0.95, 0.99), repeater(TURN_LEFT_MAT, 1.45, 0.95, -0.99))
  g.add(mirror(1.5, 1.42, 0.99, 1), mirror(1.5, 1.42, -0.99, -1))
  return g
}
```

Ensure `glass` is in the import list at the top of `cars.ts`.

- [ ] **Step 5: Wire them into `model.ts`**

Add to the `cars` import: `buildRetro, buildEv, buildMinivan`.

Add to `STOP_STYLE`:

```ts
  retro: { color: 0x5a0e00, emissive: 0xff3c00 }, // warm orange-red
  ev: { color: 0x3a0030, emissive: 0xff2eb0 }, // pink LED bar
  minivan: { color: 0x5a0018, emissive: 0xff1a3c },
```

Add to `BUILDERS`: `retro: buildRetro, ev: buildEv, minivan: buildMinivan,`

- [ ] **Step 6: Add emoji + labels**

`src/ui/settingsMenu.ts:14` `VEHICLE_EMOJI`: `retro: '🚙', ev: '🔌', minivan: '🚐',`

`src/i18n/i18n.ts` `en`: `'vehicle.retro': 'Retro', 'vehicle.ev': 'Electric', 'vehicle.minivan': 'Minivan',`
`ru`: `'vehicle.retro': 'Ретро', 'vehicle.ev': 'Электро', 'vehicle.minivan': 'Минивэн',`

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit` — expected: no output (this proves all four Records are filled).
Run: `npx vitest run` — expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/vehicle src/ui/settingsMenu.ts src/i18n/i18n.ts test/vehicle test/i18n
git commit -m "feat: add retro, electric and minivan

Three car-family types. The i18n test now asserts every vehicle has a label in
every language, so a missing translation fails the build rather than showing a
raw key in the menu."
```

---

### Task 4: Truck family — tanker

**Files:**
- Modify: `src/vehicle/vehicles.ts`, `src/vehicle/model.ts`, `src/vehicle/models/trucks.ts`, `src/ui/settingsMenu.ts:14`, `src/i18n/i18n.ts`

**Interfaces:**
- Produces: type `'tanker'`; `buildTanker` exported from `models/trucks.ts`.

- [ ] **Step 1: Extend the type + spec**

`VehicleType` union: add `| 'tanker'`. `VEHICLE_TYPES`: add `'tanker',` after `'lorry'`.

```ts
  // A fuel tanker: the sloshing load makes it the loosest heavy thing here.
  tanker: {
    key: 'tanker', accel: 34, brakeAccel: 44, dragForward: 1.5, gripLateral: 2.6,
    turnRate: 0.9, turnSpeedRef: 12, maxSpeed: 27, maxReverse: 8, radius: 2.4,
  },
```

Group: `{ key: 'vehGroup.trucks', types: ['truck', 'lorry', 'bus', 'tanker'] },`

- [ ] **Step 2: Add `buildTanker` to `src/vehicle/models/trucks.ts`**

```ts
/** A fuel tanker: cab up front, a fat cylinder on the frame behind it. */
export function buildTanker(): THREE.Group {
  const g = new THREE.Group()
  const cab = 0xc8433a
  g.add(box(1.9, 1.5, 2.3, cab, 2.5, 1.5, 0)) // cab
  g.add(glass(0.1, 0.6, 2.0, 3.42, 1.9, 0)) // windscreen
  g.add(box(5.6, 0.3, 2.1, 0x3a3a44, -0.6, 0.86, 0)) // chassis rail
  // the tank itself: a cylinder lying along x
  const tank = new THREE.CylinderGeometry(1.05, 1.05, 5.2, 16)
  tank.rotateZ(Math.PI / 2) // axis Y → X
  const tankMesh = new THREE.Mesh(tank, new THREE.MeshStandardMaterial({ color: 0xd9dde2, flatShading: true }))
  tankMesh.position.set(-0.6, 1.75, 0)
  g.add(tankMesh)
  g.add(box(0.12, 1.9, 1.9, 0xb0b6bd, 1.98, 1.75, 0)) // front end cap ring
  g.add(box(0.12, 1.9, 1.9, 0xb0b6bd, -3.2, 1.75, 0)) // rear end cap ring
  g.add(box(0.5, 0.28, 0.5, 0xffcf3a, -0.6, 2.86, 0)) // top hatch
  g.add(wheel(0.55, 0.4, 2.5, 0.55, 1.1), wheel(0.55, 0.4, 2.5, 0.55, -1.1)) // steer axle
  g.add(wheel(0.55, 0.4, -1.6, 0.55, 1.1), wheel(0.55, 0.4, -1.6, 0.55, -1.1))
  g.add(wheel(0.55, 0.4, -2.8, 0.55, 1.1), wheel(0.55, 0.4, -2.8, 0.55, -1.1)) // bogie
  g.add(light(3.48, 1.0, 0.82), light(3.48, 1.0, -0.82))
  const rx = -3.32, fx = 3.48
  g.add(housingBar(0.5, 1.9, rx, 1.0, 0, -1))
  g.add(lens(REAR_LIGHT_MAT, 0.42, 0.26, rx, 1.0, 0.8, -1), lens(REAR_LIGHT_MAT, 0.42, 0.26, rx, 1.0, -0.8, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.22, 0.2, rx, 1.0, 0.5, -1), lens(TURN_LEFT_MAT, 0.22, 0.2, rx, 1.0, -0.5, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.2, 0.18, fx, 0.7, 0.98, 1), lens(TURN_LEFT_MAT, 0.2, 0.18, fx, 0.7, -0.98, 1))
  g.add(repeater(TURN_RIGHT_MAT, 1.7, 1.2, 1.06), repeater(TURN_LEFT_MAT, 1.7, 1.2, -1.06))
  g.add(mirror(3.3, 2.1, 1.16, 1), mirror(3.3, 2.1, -1.16, -1))
  return g
}
```

Make sure `wheel` and `glass` are imported in `trucks.ts`.

- [ ] **Step 2b: Wire into `model.ts`**

Import `buildTanker`; `STOP_STYLE`: `tanker: { color: 0x5a1e00, emissive: 0xff5a00 },`; `BUILDERS`: `tanker: buildTanker,`

- [ ] **Step 3: Emoji + labels**

`VEHICLE_EMOJI`: `tanker: '🛢',`
`en`: `'vehicle.tanker': 'Tanker',` — `ru`: `'vehicle.tanker': 'Цистерна',`

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` then `npx vitest run` — expected: no output, all pass.

- [ ] **Step 5: Commit**

```bash
git add src/vehicle src/ui/settingsMenu.ts src/i18n/i18n.ts
git commit -m "feat: add the tanker truck"
```

---

### Task 5: Special family — crane, roller, combine, tiller

**Files:**
- Modify: `src/vehicle/vehicles.ts`, `src/vehicle/model.ts`, `src/vehicle/models/special.ts`, `src/ui/settingsMenu.ts:14`, `src/i18n/i18n.ts`

**Interfaces:**
- Produces: types `'crane' | 'roller' | 'combine' | 'tiller'`; builders `buildCrane`, `buildRoller`, `buildCombine`, `buildTiller` from `models/special.ts`.

- [ ] **Step 1: Types + specs**

Union: add `| 'crane' | 'roller' | 'combine' | 'tiller'`. `VEHICLE_TYPES`: add all four after `'tractor'`.

```ts
  // A mobile crane: long, top-heavy, hauls itself around at a walking pace.
  crane: {
    key: 'crane', accel: 30, brakeAccel: 42, dragForward: 1.4, gripLateral: 3.0,
    turnRate: 1.0, turnSpeedRef: 12, maxSpeed: 22, maxReverse: 7, radius: 2.3,
  },
  // A road roller: barely moves, stops on a coin.
  roller: {
    key: 'roller', accel: 20, brakeAccel: 38, dragForward: 1.3, gripLateral: 5,
    turnRate: 1.2, turnSpeedRef: 5, maxSpeed: 10, maxReverse: 5, radius: 1.8,
  },
  // A combine harvester: big, slow, surprisingly tidy through a bend.
  combine: {
    key: 'combine', accel: 24, brakeAccel: 38, dragForward: 1.3, gripLateral: 3.8,
    turnRate: 1.5, turnSpeedRef: 6, maxSpeed: 13, maxReverse: 6, radius: 2.2,
  },
  // A walk-behind tiller: tiny, slow, spins on the spot.
  tiller: {
    key: 'tiller', accel: 22, brakeAccel: 30, dragForward: 1.6, gripLateral: 6,
    turnRate: 2.6, turnSpeedRef: 3, maxSpeed: 8, maxReverse: 4, radius: 0.5,
  },
```

Group: `{ key: 'vehGroup.special', types: ['tractor', 'crane', 'roller', 'combine', 'tiller'] },`

- [ ] **Step 2: Builders in `src/vehicle/models/special.ts`**

```ts
/** A mobile crane: cab, outriggers, and a fixed boom raked up over the nose. */
export function buildCrane(): THREE.Group {
  const g = new THREE.Group()
  const body = 0xf2b33a // works yellow
  g.add(box(6.2, 0.7, 2.3, body, 0, 0.85, 0)) // carrier deck
  g.add(box(1.7, 1.4, 2.0, body, 2.1, 1.9, 0)) // cab
  g.add(glass(0.1, 0.7, 1.7, 2.98, 2.1, 0))
  g.add(box(1.8, 1.0, 1.9, 0x3a3a44, -0.9, 1.8, 0)) // slew housing
  // boom: raked up toward +x, built as three shortening segments
  const boom = new THREE.Group()
  boom.add(box(4.2, 0.45, 0.5, body, 2.1, 0, 0))
  boom.add(box(3.4, 0.36, 0.4, 0xd9dde2, 5.4, 0.02, 0))
  boom.add(box(2.6, 0.28, 0.3, body, 8.2, 0.04, 0))
  boom.position.set(-0.6, 2.4, 0)
  boom.rotation.z = 0.42 // rake up ~24°
  g.add(boom)
  g.add(box(0.3, 0.6, 0.3, 0x3a3a44, -2.6, 2.4, 0)) // counterweight
  g.add(box(0.5, 0.24, 0.5, 0x3a3a44, 2.2, 0.5, 1.35), box(0.5, 0.24, 0.5, 0x3a3a44, 2.2, 0.5, -1.35)) // outriggers
  g.add(box(0.5, 0.24, 0.5, 0x3a3a44, -2.2, 0.5, 1.35), box(0.5, 0.24, 0.5, 0x3a3a44, -2.2, 0.5, -1.35))
  g.add(wheel(0.6, 0.42, 2.2, 0.6, 1.05), wheel(0.6, 0.42, 2.2, 0.6, -1.05))
  g.add(wheel(0.6, 0.42, 0.4, 0.6, 1.05), wheel(0.6, 0.42, 0.4, 0.6, -1.05))
  g.add(wheel(0.6, 0.42, -2.2, 0.6, 1.05), wheel(0.6, 0.42, -2.2, 0.6, -1.05))
  g.add(light(3.06, 1.3, 0.8), light(3.06, 1.3, -0.8))
  const rx = -3.12
  g.add(housingBar(0.4, 1.8, rx, 1.0, 0, -1))
  g.add(lens(REAR_LIGHT_MAT, 0.34, 0.24, rx, 1.0, 0.7, -1), lens(REAR_LIGHT_MAT, 0.34, 0.24, rx, 1.0, -0.7, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.22, 0.2, rx, 1.0, 0.35, -1), lens(TURN_LEFT_MAT, 0.22, 0.2, rx, 1.0, -0.35, -1))
  g.add(repeater(TURN_RIGHT_MAT, 1.6, 1.1, 1.16), repeater(TURN_LEFT_MAT, 1.6, 1.1, -1.16))
  return g
}

/** A road roller: a wide steel drum at the front, rubber wheels behind. */
export function buildRoller(): THREE.Group {
  const g = new THREE.Group()
  const body = 0xf2b33a
  g.add(box(2.6, 0.7, 1.5, body, -0.4, 1.15, 0)) // frame
  g.add(box(1.3, 0.9, 1.4, body, -1.0, 1.9, 0)) // operator platform
  g.add(box(0.1, 0.5, 1.2, 0x1c2733, -0.38, 2.1, 0)) // screen
  g.add(person(-1.0, 2.0, 0, false, true))
  // drum: a wide cylinder with its axle along z, tagged so it rolls
  const drumGeo = new THREE.CylinderGeometry(0.75, 0.75, 1.7, 20)
  drumGeo.rotateX(Math.PI / 2)
  const drum = new THREE.Group()
  drum.add(new THREE.Mesh(drumGeo, new THREE.MeshStandardMaterial({ color: 0xb8bec6, flatShading: true })))
  drum.add(box(1.6, 0.1, 1.74, 0x8f959d, 0, 0, 0)) // stripe so the roll reads
  drum.position.set(1.2, 0.75, 0)
  drum.userData.wheelRadius = 0.75
  g.add(drum)
  g.add(box(0.3, 0.5, 1.8, 0x3a3a44, 0.5, 1.0, 0)) // drum yoke
  g.add(wheel(0.5, 0.5, -1.5, 0.5, 0.7), wheel(0.5, 0.5, -1.5, 0.5, -0.7))
  g.add(light(0.6, 2.2, 0.5), light(0.6, 2.2, -0.5))
  const rx = -1.72
  g.add(housingBar(0.3, 1.2, rx, 1.3, 0, -1))
  g.add(lens(REAR_LIGHT_MAT, 0.26, 0.22, rx, 1.3, 0.45, -1), lens(REAR_LIGHT_MAT, 0.26, 0.22, rx, 1.3, -0.45, -1))
  return g
}

/** A combine harvester: tall body, a wide toothed header out front. */
export function buildCombine(): THREE.Group {
  const g = new THREE.Group()
  const body = 0x2f7a3f // harvester green
  g.add(box(4.4, 1.5, 2.4, body, -0.4, 1.7, 0)) // body
  g.add(box(1.5, 1.2, 1.8, 0xdfe4e8, 1.5, 2.9, 0)) // cab up high
  g.add(glass(0.1, 0.8, 1.6, 2.22, 2.9, 0))
  g.add(box(1.2, 1.0, 1.4, body, -2.4, 2.6, 0)) // grain tank
  g.add(box(2.2, 0.24, 0.24, 0xd9dde2, -1.6, 3.3, 0.9)) // unloading auger
  // header: wide bar with teeth, low at the front
  g.add(box(0.7, 0.5, 3.6, 0xf2b33a, 2.5, 0.75, 0))
  for (let i = -3; i <= 3; i++) g.add(box(0.5, 0.1, 0.1, 0xb8bec6, 2.95, 0.75, i * 0.5))
  g.add(box(0.3, 0.9, 3.4, body, 2.1, 1.3, 0)) // header throat
  g.add(wheel(0.85, 0.55, 0.9, 0.85, 1.05), wheel(0.85, 0.55, 0.9, 0.85, -1.05)) // big drive wheels
  g.add(wheel(0.45, 0.3, -2.3, 0.45, 0.75), wheel(0.45, 0.3, -2.3, 0.45, -0.75)) // small steer wheels
  g.add(light(2.3, 3.3, 0.6), light(2.3, 3.3, -0.6))
  const rx = -2.62
  g.add(housingBar(0.4, 1.9, rx, 1.6, 0, -1))
  g.add(lens(REAR_LIGHT_MAT, 0.34, 0.26, rx, 1.6, 0.8, -1), lens(REAR_LIGHT_MAT, 0.34, 0.26, rx, 1.6, -0.8, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.22, 0.2, rx, 1.6, 0.4, -1), lens(TURN_LEFT_MAT, 0.22, 0.2, rx, 1.6, -0.4, -1))
  return g
}

/** A walk-behind tiller: two wheels, handlebars, and a driver on foot behind. */
export function buildTiller(): THREE.Group {
  const g = new THREE.Group()
  const body = 0xd94f2b
  g.add(box(0.8, 0.5, 0.6, body, 0.1, 0.62, 0)) // engine block
  g.add(box(0.3, 0.34, 0.34, 0x3a3a44, 0.55, 0.62, 0)) // exhaust/filter
  g.add(box(0.16, 0.3, 0.16, 0xb8bec6, 0.1, 0.95, 0)) // filler neck
  // handlebars raked back over the driver
  const bars = new THREE.Group()
  bars.add(box(1.5, 0.07, 0.07, 0x3a3a44, -0.6, 0, 0.28))
  bars.add(box(1.5, 0.07, 0.07, 0x3a3a44, -0.6, 0, -0.28))
  bars.add(box(0.08, 0.07, 0.62, 0x1c2733, -1.32, 0.06, 0)) // cross grip
  bars.position.set(0, 0.72, 0)
  bars.rotation.z = 0.3
  g.add(bars)
  g.add(wheel(0.32, 0.18, 0.1, 0.32, 0.42), wheel(0.32, 0.18, 0.1, 0.32, -0.42))
  g.add(box(0.4, 0.3, 0.5, 0x3a3a44, -0.5, 0.3, 0)) // tine guard
  g.add(person(-1.3, 0.0, 0, false, true)) // walking behind
  g.add(light(0.62, 0.85, 0))
  g.add(housingBar(0.2, 0.4, -0.52, 0.7, 0, -1))
  g.add(lens(REAR_LIGHT_MAT, 0.18, 0.3, -0.52, 0.7, 0, -1))
  return g
}
```

Ensure `special.ts` imports `box, wheel, glass, person, light, lens, housingBar, repeater, REAR_LIGHT_MAT, TURN_LEFT_MAT, TURN_RIGHT_MAT` — and `import * as THREE from 'three'`.

- [ ] **Step 3: Wire into `model.ts`**

Import all four. `STOP_STYLE`:

```ts
  crane: { color: 0x5a2400, emissive: 0xff6a00 },
  roller: { color: 0x5a2400, emissive: 0xff6a00 },
  combine: { color: 0x5a2400, emissive: 0xff6a00 },
  tiller: { color: 0x5a0e00, emissive: 0xff3c00 },
```

`BUILDERS`: `crane: buildCrane, roller: buildRoller, combine: buildCombine, tiller: buildTiller,`

- [ ] **Step 4: Emoji + labels**

`VEHICLE_EMOJI`: `crane: '🏗', roller: '🛞', combine: '🌾', tiller: '⚙',`
`en`: `'vehicle.crane': 'Crane', 'vehicle.roller': 'Roller', 'vehicle.combine': 'Combine', 'vehicle.tiller': 'Tiller',`
`ru`: `'vehicle.crane': 'Автокран', 'vehicle.roller': 'Каток', 'vehicle.combine': 'Комбайн', 'vehicle.tiller': 'Мотоблок',`

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit` then `npx vitest run` — expected: no output, all pass. The roller's drum is tagged `wheelRadius`, so the "spinnable wheels" test covers it.

- [ ] **Step 6: Commit**

```bash
git add src/vehicle src/ui/settingsMenu.ts src/i18n/i18n.ts
git commit -m "feat: add crane, roller, combine and tiller

The roller's drum is tagged wheelRadius, so the existing spin loop rolls it
like a wheel with no special case."
```

---

### Task 6: Exotic — tracked all-terrain vehicle

**Files:**
- Modify: `src/vehicle/vehicles.ts`, `src/vehicle/model.ts`, `src/vehicle/models/exotic.ts`, `src/ui/settingsMenu.ts:14`, `src/i18n/i18n.ts`

**Interfaces:**
- Produces: type `'tracked'`; `buildTracked` from `models/exotic.ts`.

- [ ] **Step 1: Type + spec**

Union: add `| 'tracked'`. `VEHICLE_TYPES`: add `'tracked',`.

```ts
  // Tracks bite: it crawls, but it will not slide out from under you.
  tracked: {
    key: 'tracked', accel: 40, brakeAccel: 55, dragForward: 1.6, gripLateral: 11,
    turnRate: 1.4, turnSpeedRef: 6, maxSpeed: 18, maxReverse: 8, radius: 1.7,
  },
```

Group: `{ key: 'vehGroup.exotic', types: ['motorbike', 'tracked'] },`

- [ ] **Step 2: `buildTracked` in `src/vehicle/models/exotic.ts`**

```ts
/**
 * A tracked all-terrain vehicle. The tracks are static slabs; the road wheels
 * inside them are tagged so they spin and sell the motion.
 */
export function buildTracked(): THREE.Group {
  const g = new THREE.Group()
  const body = 0x5c6b3f // olive
  g.add(box(3.6, 0.9, 1.7, body, 0, 1.25, 0)) // hull
  g.add(box(2.0, 0.7, 1.5, body, -0.3, 1.95, 0)) // cabin
  g.add(glass(0.1, 0.5, 1.3, 0.72, 2.0, 0))
  g.add(box(0.5, 0.3, 1.6, body, 1.9, 1.1, 0)) // sloped nose
  // track slabs down each side
  for (const z of [1.0, -1.0]) {
    g.add(box(4.0, 0.5, 0.42, 0x24242a, 0, 0.55, z)) // track run
    g.add(box(0.42, 0.42, 0.42, 0x24242a, 2.0, 0.72, z)) // front idler cover
    g.add(box(0.42, 0.42, 0.42, 0x24242a, -2.0, 0.72, z)) // rear sprocket cover
    // road wheels peeking out of the track — these spin
    for (const x of [1.2, 0, -1.2]) g.add(wheel(0.3, 0.3, x, 0.55, z))
  }
  g.add(light(2.18, 1.2, 0.6), light(2.18, 1.2, -0.6))
  const rx = -2.02
  g.add(housingBar(0.36, 1.4, rx, 1.4, 0, -1))
  g.add(lens(REAR_LIGHT_MAT, 0.3, 0.24, rx, 1.4, 0.55, -1), lens(REAR_LIGHT_MAT, 0.3, 0.24, rx, 1.4, -0.55, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.2, 0.18, rx, 1.4, 0.2, -1), lens(TURN_LEFT_MAT, 0.2, 0.18, rx, 1.4, -0.2, -1))
  return g
}
```

Ensure `exotic.ts` imports `box, wheel, glass, light, lens, housingBar, REAR_LIGHT_MAT, TURN_LEFT_MAT, TURN_RIGHT_MAT`.

- [ ] **Step 3: Wire + label**

`model.ts`: import `buildTracked`; `STOP_STYLE`: `tracked: { color: 0x3a2400, emissive: 0xff7a00 },`; `BUILDERS`: `tracked: buildTracked,`
`VEHICLE_EMOJI`: `tracked: '⛰',`
`en`: `'vehicle.tracked': 'Tracked',` — `ru`: `'vehicle.tracked': 'Вездеход',`

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` then `npx vitest run` — expected: no output, all pass.

- [ ] **Step 5: Commit**

```bash
git add src/vehicle src/ui/settingsMenu.ts src/i18n/i18n.ts
git commit -m "feat: add the tracked all-terrain vehicle"
```

---

### Task 7: Exotic — the hovercar, and the one physics change

The only vehicle that touches physics. It floats `HOVER_H` above the terrain, has no wheels, and stays level instead of pitching to the slope.

**Files:**
- Modify: `src/vehicle/vehicles.ts` (type, spec, group, `HOVERS`)
- Modify: `src/vehicle/car.ts:31-38` (signature stays), `:86` (Y)
- Modify: `src/app/scene.ts:129` (`syncCamera` gains `level`), `:137`
- Modify: `src/app/main.ts:370` (pass the flag)
- Modify: `src/vehicle/model.ts`, `src/vehicle/models/exotic.ts`, `src/ui/settingsMenu.ts:14`, `src/i18n/i18n.ts`
- Test: `test/vehicle/car.test.ts`, `test/vehicle/model.test.ts`

**Interfaces:**
- Consumes: `stepCar(car, input, dt, grid, provider, spec)` — signature unchanged; the hover branch keys off `spec.key`.
- Produces: `HOVERS: Partial<Record<VehicleType, boolean>>`, `HOVER_H: number`; `buildHover` from `models/exotic.ts`; `syncCamera(stage, car, dt, provider, lean = 0, level = false)`.

- [ ] **Step 1: Write the failing tests**

Add to `test/vehicle/car.test.ts`. That file already has `createCar`, `stepCar`, `emptyGrid`,
`NO_INPUT` and `VEHICLES` imported at the top, and a local `const car = VEHICLES.car` — so name
the locals below distinctly to avoid shadowing it. `FlatProvider` always returns 0, so use a
ground stub at a non-zero height to prove the offset is real rather than accidentally 0:

```ts
import { HOVER_H } from '../../src/vehicle/vehicles'

it('floats the hovercar above the terrain and plants a normal car on it', () => {
  const ground = { heightAt: () => 12 }

  const floated = stepCar(createCar(), NO_INPUT, 0.016, emptyGrid, ground, VEHICLES.hover)
  expect(floated.y).toBeCloseTo(12 + HOVER_H)

  const planted = stepCar(createCar(), NO_INPUT, 0.016, emptyGrid, ground, VEHICLES.car)
  expect(planted.y).toBeCloseTo(12)
})
```

Add to `test/vehicle/model.test.ts` — and **change the existing "spinnable wheels" test** to skip the wheel-less hovercar:

```ts
import { HOVERS } from '../../src/vehicle/vehicles'

// in the wheels test, replace the loop body's first line with:
    if (HOVERS[type]) continue // floats — no wheels by design

it('builds the hovercar with no wheels', () => {
  let wheels = 0
  buildVehicleMesh('hover').traverse((o) => {
    if ((o.userData as { wheelRadius?: number }).wheelRadius) wheels++
  })
  expect(wheels).toBe(0)
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/vehicle`
Expected: FAIL — `VEHICLES.hover` undefined / `HOVER_H` not exported.

- [ ] **Step 3: Add the type, spec, `HOVERS` and `HOVER_H`**

In `src/vehicle/vehicles.ts`: union gets `| 'hover'`; `VEHICLE_TYPES` gets `'hover',`.

```ts
/** Vehicles with no wheels that float above the ground. */
export const HOVERS: Partial<Record<VehicleType, boolean>> = { hover: true }

/** How high a hovering vehicle floats above the terrain, in metres. */
export const HOVER_H = 1.0
```

```ts
  // No wheels, no grip: it floats, so it slides through bends and coasts on the brakes.
  hover: {
    key: 'hover', accel: 85, brakeAccel: 40, dragForward: 1.6, gripLateral: 1.2,
    turnRate: 2.6, turnSpeedRef: 6, maxSpeed: 46, maxReverse: 14, radius: 1.3,
  },
```

Group: `{ key: 'vehGroup.exotic', types: ['motorbike', 'tracked', 'hover'] },`

- [ ] **Step 4: Float it in `src/vehicle/car.ts`**

Add to the imports on line 4:

```ts
import { HOVERS, HOVER_H, type VehicleSpec } from './vehicles'
```

Replace line 86 (`y: provider.heightAt(resolved.x, resolved.z),`) with:

```ts
    y: provider.heightAt(resolved.x, resolved.z) + (HOVERS[spec.key] ? HOVER_H : 0),
```

- [ ] **Step 5: Keep it level in `src/app/scene.ts`**

Change the signature at line 129:

```ts
export function syncCamera(stage: Stage, car: CarState, dt: number, provider: ElevationProvider, lean = 0, level = false): void {
```

Replace line 137 (`nUp.set(...).normalize()`) with:

```ts
  // A hovering vehicle floats level; everything else pitches to the slope.
  if (level) nUp.set(0, 1, 0)
  else nUp.set(-dHx / (2 * e), 1, -dHz / (2 * e)).normalize()
```

Leave lines 135–136 (the `dHx`/`dHz` reads) where they are — they are cheap and keep the diff small.

- [ ] **Step 6: Pass the flag from `src/app/main.ts`**

Line 81 import becomes:

```ts
import { VEHICLES, LEANS, HOVERS, type VehicleType } from '../vehicle/vehicles'
```

Line 370 becomes:

```ts
        syncCamera(stage, car, dt, provider, lean, !!HOVERS[vehicle])
```

- [ ] **Step 7: `buildHover` in `src/vehicle/models/exotic.ts`**

```ts
/** A wheel-less aero car: a smooth hull over four glowing lift pods. */
export function buildHover(): THREE.Group {
  const g = new THREE.Group()
  const body = 0x2bb3c9 // cyan
  g.add(box(4.0, 0.42, 1.9, body, 0, 0.75, 0)) // hull pan
  g.add(box(2.6, 0.44, 1.7, body, -0.2, 1.16, 0)) // waist
  g.add(glass(0.1, 0.42, 1.5, 1.0, 1.5, 0)) // canopy front
  g.add(box(1.6, 0.4, 1.4, 0x1c2733, -0.5, 1.52, 0)) // canopy
  g.add(box(0.6, 0.24, 1.8, body, 2.05, 0.86, 0)) // nose
  g.add(box(0.4, 0.5, 0.16, body, -2.05, 1.2, 0.7)) // tail fins
  g.add(box(0.4, 0.5, 0.16, body, -2.05, 1.2, -0.7))
  // lift pods: glowing discs under each corner, in place of wheels
  const podMat = new THREE.MeshStandardMaterial({
    color: 0x0a2a33, emissive: 0x39c6ff, emissiveIntensity: 0.9, flatShading: true,
  })
  for (const [x, z] of [[1.4, 0.82], [1.4, -0.82], [-1.4, 0.82], [-1.4, -0.82]] as const) {
    const pod = new THREE.CylinderGeometry(0.42, 0.3, 0.28, 12)
    const m = new THREE.Mesh(pod, podMat)
    m.position.set(x, 0.42, z)
    g.add(m) // deliberately NOT tagged wheelRadius: nothing to roll
  }
  g.add(light(2.32, 0.9, 0.6), light(2.32, 0.9, -0.6))
  const rx = -2.05, fx = 2.32
  g.add(housingBar(0.3, 1.7, rx, 1.0, 0, -1))
  g.add(lens(REAR_LIGHT_MAT, 0.3, 1.3, rx, 1.0, 0, -1)) // one bar
  g.add(lens(TURN_RIGHT_MAT, 0.2, 0.18, rx, 0.72, 0.8, -1), lens(TURN_LEFT_MAT, 0.2, 0.18, rx, 0.72, -0.8, -1))
  g.add(lens(TURN_RIGHT_MAT, 0.18, 0.16, fx, 0.7, 0.82, 1), lens(TURN_LEFT_MAT, 0.18, 0.16, fx, 0.7, -0.82, 1))
  return g
}
```

- [ ] **Step 8: Wire + label**

`model.ts`: import `buildHover`; `STOP_STYLE`: `hover: { color: 0x003a4a, emissive: 0x00e5ff },`; `BUILDERS`: `hover: buildHover,`
`VEHICLE_EMOJI`: `hover: '🛸',`
`en`: `'vehicle.hover': 'Hovercar',` — `ru`: `'vehicle.hover': 'Аэромобиль',`

- [ ] **Step 9: Verify**

Run: `npx vitest run test/vehicle` — expected: PASS, including the float and no-wheels tests.
Run: `npx tsc --noEmit` — expected: no output.
Run: `npx vitest run` — expected: all suites pass.
Run: `npm run build` — expected: `✓ built`.

- [ ] **Step 10: Commit**

```bash
git add src/vehicle src/app/scene.ts src/app/main.ts src/ui/settingsMenu.ts src/i18n/i18n.ts test/vehicle
git commit -m "feat: add the hovercar

The only vehicle that touches physics: HOVERS keys a 1m float in stepCar, and
syncCamera keeps it level instead of pitching it to the slope. It has no
wheels, so the spin loop finds nothing tagged and leaves it alone. Walls and
water still stop it — this floats, it does not fly."
```

---

### Task 8: Ship v0.58.0

**Files:**
- Modify: `package.json` (version), `TODO.md` (tick the entries)

- [ ] **Step 1: Tick the TODO entries**

In `TODO.md`, replace the ten-vehicle block and the grouping line with:

```markdown
- [x] **Ten more vehicles** — crane, minivan, tracked ATV, hovercar, EV, retro, tanker,
      tiller, roller, combine — done in v0.58.0
- [x] **Grouped, collapsible vehicle picker** (4 groups by purpose) — done in v0.58.0
```

- [ ] **Step 2: Bump the version**

`package.json`: `"version": "0.58.0",`

- [ ] **Step 3: Full verification before shipping**

Run: `npx tsc --noEmit` — expected: no output.
Run: `npx vitest run` — expected: all suites pass.
Run: `npm run build` — expected: `✓ built`.

Then open the app and click through the picker — the four groups must expand/collapse and remember state, and the hovercar must visibly float. Run: `npm run dev` and load a city.

- [ ] **Step 4: Commit**

```bash
git add package.json TODO.md
git commit -m "feat: ten more vehicles + grouped vehicle picker (v0.58.0)"
```

- [ ] **Step 5: Ship — exact sequence, do not deviate**

```bash
git push origin master
git checkout main && git merge --ff-only master && git push origin main
git tag v0.58.0 && git push origin v0.58.0
git checkout master
git rev-parse main master   # must print the same hash twice
gh run list --limit 3       # must show a Deploy run, not only Release
```
