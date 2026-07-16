# Race the City Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Browser 3D game where you freely drive a car around a real city built from OpenStreetMap geometry over real elevation from Terrain Tiles.

**Architecture:** Static Vite + TypeScript + Three.js app, no backend. A pure **data layer** (`geo/`, `terrain/`) knows nothing about Three.js and returns plain numbers; a **world layer** (`world/`) turns that data into meshes; a **physics layer** (`physics/`) does 2D circle-vs-polygon collision; a **vehicle layer** drives an arcade car that follows the terrain. Everything is wired in `app/main.ts`.

**Tech Stack:** Vite, TypeScript, Three.js, Vitest (tests). Data: Nominatim (geocode), Overpass API (roads/buildings), AWS Terrain Tiles / Terrarium (elevation), IndexedDB (cache).

## Global Constraints

- Language: **TypeScript**, strict mode on (`"strict": true` in tsconfig).
- No backend — static site only. All network calls go directly from the browser.
- Test runner: **Vitest**. Pure functions (projection, parse, terrarium decode, road width, building height, spatial grid, collision, car step) are unit-tested; rendering and driving feel are verified manually.
- Coordinate convention: ground plane is Three.js **XZ**, up is **+Y**. Projection maps `lon → x`, `lat → -z` (north is −z), elevation → `y`. Local origin (0,0) is the geocoded city center.
- Start radius **R = 1000 m** (bbox is center ± R).
- Terrarium decode formula (verbatim): `height = (R*256 + G + B/256) - 32768` meters.
- Elevation must degrade gracefully: if Terrain Tiles fail, fall back to `FlatProvider` (height = 0) and keep running.
- Low-poly flat-color style. Wireframe mode, parks/water, realistic physics, minimap, audio, opponents are **out of scope** for this plan.

---

## File Structure

```
index.html                     app entry, mounts #app and #ui
src/
  geo/
    types.ts        LatLon, Vec2, RoadKind, Road, Building, WorldData
    project.ts      Projector: latlon <-> local meters
    parse.ts        raw Overpass JSON -> WorldData (roads/buildings in local meters)
    overpass.ts     build query, fetch OSM for a bbox
    geocode.ts      Nominatim: city name -> LatLon
    cache.ts        IndexedDB get/put keyed by bbox
  terrain/
    provider.ts     ElevationProvider interface
    flat.ts         FlatProvider (height 0) — fallback
    terrarium.ts    TerrariumProvider: fetch/stitch tiles, decode, bilinear sample
  world/
    ground.ts       displaced ground mesh from provider
    buildings.ts    extruded building meshes + footprint polygons
    roads.ts        road ribbon meshes draped on terrain
  physics/
    grid.ts         uniform spatial grid over building footprints
    collide.ts      circle-vs-polygon resolve (push-out + slide)
  vehicle/
    car.ts          arcade car state + step()
    input.ts        keyboard state (WASD/arrows)
  app/
    scene.ts        renderer, scene, lights, fog, follow camera
    loop.ts         requestAnimationFrame loop
    main.ts         wires input -> geo -> terrain -> world -> car -> render
  ui/
    cityInput.ts    city text box + "Поехали" button
    loading.ts      loading / error overlay
test/               mirrors src/ for unit tests
```

---

### Task 1: Project scaffold + reference scene

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/app/main.ts`, `.gitignore`
- Test: `test/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `npm run dev` (Three.js scene) and `npm test` (Vitest). Establishes `three` import and build config every later task relies on.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "race-the-city",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "three": "^0.169.0"
  },
  "devDependencies": {
    "@types/three": "^0.169.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true,
    "types": ["vitest/globals"],
    "lib": ["ES2021", "DOM", "DOM.Iterable"]
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  test: { globals: true, environment: 'node' },
})
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
dist/
out/
```

- [ ] **Step 5: Create `index.html`**

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Race the City</title>
    <style>
      html, body { margin: 0; height: 100%; overflow: hidden; background: #0b0e13; }
      #app { position: fixed; inset: 0; }
      #ui { position: fixed; inset: 0; pointer-events: none; font-family: system-ui, sans-serif; }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <div id="ui"></div>
    <script type="module" src="/src/app/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `src/app/main.ts` (reference scene)**

```ts
import * as THREE from 'three'

const mount = document.getElementById('app')!
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
mount.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x87ceeb)
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 5000)
camera.position.set(0, 6, 12)
camera.lookAt(0, 0, 0)

scene.add(new THREE.AmbientLight(0xffffff, 0.6))
const sun = new THREE.DirectionalLight(0xffffff, 1)
sun.position.set(50, 100, 50)
scene.add(sun)

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(2, 2, 2),
  new THREE.MeshStandardMaterial({ color: 0xff6b35 }),
)
scene.add(cube)

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

renderer.setAnimationLoop(() => {
  cube.rotation.y += 0.01
  renderer.render(scene, camera)
})
```

- [ ] **Step 7: Create `test/smoke.test.ts`**

```ts
import { describe, it, expect } from 'vitest'

describe('toolchain', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 8: Install and verify**

Run: `npm install`
Then: `npm test`
Expected: 1 passing test.
Then: `npm run dev` and open the URL — expected: a rotating orange cube on sky-blue background.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + TS + Three.js + Vitest with reference scene"
```

---

### Task 2: Core types + projection

**Files:**
- Create: `src/geo/types.ts`, `src/geo/project.ts`
- Test: `test/geo/project.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface LatLon { lat: number; lon: number }`
  - `interface Vec2 { x: number; z: number }`
  - `type RoadKind = 'motorway'|'primary'|'secondary'|'residential'|'service'|'path'|'other'`
  - `interface Road { points: Vec2[]; kind: RoadKind }`
  - `interface Building { footprint: Vec2[]; height: number }`
  - `interface WorldData { roads: Road[]; buildings: Building[] }`
  - `class Projector { constructor(center: LatLon); toLocal(p: LatLon): Vec2; toLatLon(v: Vec2): LatLon }`

- [ ] **Step 1: Create `src/geo/types.ts`**

```ts
export interface LatLon { lat: number; lon: number }

/** Local ground-plane meters. x = east, z = south (north is -z). */
export interface Vec2 { x: number; z: number }

export type RoadKind =
  | 'motorway' | 'primary' | 'secondary' | 'residential' | 'service' | 'path' | 'other'

export interface Road { points: Vec2[]; kind: RoadKind }
export interface Building { footprint: Vec2[]; height: number }
export interface WorldData { roads: Road[]; buildings: Building[] }
```

- [ ] **Step 2: Write the failing test `test/geo/project.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { Projector } from '../../src/geo/project'

const CENTER = { lat: 41.7151, lon: 44.8271 } // Tbilisi

describe('Projector', () => {
  it('maps the center to the origin', () => {
    const p = new Projector(CENTER)
    const v = p.toLocal(CENTER)
    expect(Math.abs(v.x)).toBeLessThan(1e-6)
    expect(Math.abs(v.z)).toBeLessThan(1e-6)
  })

  it('maps north (higher lat) to negative z', () => {
    const p = new Projector(CENTER)
    const v = p.toLocal({ lat: CENTER.lat + 0.001, lon: CENTER.lon })
    expect(v.z).toBeLessThan(0)
    expect(Math.abs(v.x)).toBeLessThan(0.01)
  })

  it('maps east (higher lon) to positive x', () => {
    const p = new Projector(CENTER)
    const v = p.toLocal({ lat: CENTER.lat, lon: CENTER.lon + 0.001 })
    expect(v.x).toBeGreaterThan(0)
  })

  it('roundtrips within a millimeter', () => {
    const p = new Projector(CENTER)
    const original = { lat: CENTER.lat + 0.002, lon: CENTER.lon - 0.003 }
    const back = p.toLatLon(p.toLocal(original))
    expect(Math.abs(back.lat - original.lat)).toBeLessThan(1e-7)
    expect(Math.abs(back.lon - original.lon)).toBeLessThan(1e-7)
  })

  it('scales ~111 km per degree of latitude', () => {
    const p = new Projector(CENTER)
    const v = p.toLocal({ lat: CENTER.lat + 1, lon: CENTER.lon })
    expect(Math.abs(v.z)).toBeGreaterThan(110000)
    expect(Math.abs(v.z)).toBeLessThan(112000)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/geo/project.test.ts`
Expected: FAIL — cannot find module `project`.

- [ ] **Step 4: Create `src/geo/project.ts`**

```ts
import type { LatLon, Vec2 } from './types'

const M_PER_DEG_LAT = 111320

export class Projector {
  private readonly lat0: number
  private readonly lon0: number
  private readonly mPerDegLon: number

  constructor(center: LatLon) {
    this.lat0 = center.lat
    this.lon0 = center.lon
    this.mPerDegLon = M_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180)
  }

  toLocal(p: LatLon): Vec2 {
    return {
      x: (p.lon - this.lon0) * this.mPerDegLon,
      z: -(p.lat - this.lat0) * M_PER_DEG_LAT,
    }
  }

  toLatLon(v: Vec2): LatLon {
    return {
      lat: this.lat0 - v.z / M_PER_DEG_LAT,
      lon: this.lon0 + v.x / this.mPerDegLon,
    }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/geo/project.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/geo/types.ts src/geo/project.ts test/geo/project.test.ts
git commit -m "feat(geo): core types and lat/lon <-> local meter projection"
```

---

### Task 3: Parse Overpass JSON into WorldData

**Files:**
- Create: `src/geo/parse.ts`
- Test: `test/geo/parse.test.ts`, `test/fixtures/overpass-small.json`

**Interfaces:**
- Consumes: `Projector` (Task 2), `WorldData`, `Road`, `Building`, `RoadKind` (Task 2).
- Produces:
  - `function classifyRoad(highway: string | undefined): RoadKind`
  - `function buildingHeight(tags: Record<string,string>): number`
  - `function parseOsm(json: OverpassResponse, projector: Projector): WorldData`
  - `interface OverpassElement { type: 'node'|'way'|'relation'; id: number; lat?: number; lon?: number; nodes?: number[]; tags?: Record<string,string> }`
  - `interface OverpassResponse { elements: OverpassElement[] }`

- [ ] **Step 1: Create fixture `test/fixtures/overpass-small.json`**

```json
{
  "elements": [
    { "type": "node", "id": 1, "lat": 41.7151, "lon": 44.8271 },
    { "type": "node", "id": 2, "lat": 41.7161, "lon": 44.8271 },
    { "type": "node", "id": 3, "lat": 41.7161, "lon": 44.8281 },
    { "type": "node", "id": 4, "lat": 41.7151, "lon": 44.8281 },
    { "type": "way", "id": 100, "nodes": [1, 2], "tags": { "highway": "residential" } },
    { "type": "way", "id": 101, "nodes": [2, 3], "tags": { "highway": "motorway" } },
    { "type": "way", "id": 200, "nodes": [1, 2, 3, 4, 1], "tags": { "building": "yes", "building:levels": "5" } },
    { "type": "way", "id": 201, "nodes": [1, 3, 4], "tags": { "building": "house", "height": "8" } },
    { "type": "way", "id": 300, "nodes": [1, 2], "tags": { "amenity": "cafe" } }
  ]
}
```

- [ ] **Step 2: Write the failing test `test/geo/parse.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import fixture from '../fixtures/overpass-small.json'
import { parseOsm, classifyRoad, buildingHeight, type OverpassResponse } from '../../src/geo/parse'
import { Projector } from '../../src/geo/project'

const projector = new Projector({ lat: 41.7151, lon: 44.8271 })

describe('classifyRoad', () => {
  it('maps known highway tags', () => {
    expect(classifyRoad('motorway')).toBe('motorway')
    expect(classifyRoad('residential')).toBe('residential')
    expect(classifyRoad('footway')).toBe('path')
  })
  it('falls back to other for unknown/missing', () => {
    expect(classifyRoad(undefined)).toBe('other')
    expect(classifyRoad('unclassified')).toBe('other')
  })
})

describe('buildingHeight', () => {
  it('uses explicit height in meters', () => {
    expect(buildingHeight({ height: '8' })).toBeCloseTo(8)
  })
  it('derives height from levels (3m per level)', () => {
    expect(buildingHeight({ 'building:levels': '5' })).toBeCloseTo(15)
  })
  it('defaults when no tags present', () => {
    expect(buildingHeight({})).toBeGreaterThan(0)
  })
})

describe('parseOsm', () => {
  const world = parseOsm(fixture as OverpassResponse, projector)

  it('extracts roads with points and kind', () => {
    expect(world.roads.length).toBe(2)
    const motorway = world.roads.find((r) => r.kind === 'motorway')!
    expect(motorway.points.length).toBe(2)
  })

  it('ignores ways without highway or building tags', () => {
    // the amenity=cafe way must not become a road or building
    const total = world.roads.length + world.buildings.length
    expect(total).toBe(4) // 2 roads + 2 buildings
  })

  it('extracts buildings with a closed footprint and a height', () => {
    expect(world.buildings.length).toBe(2)
    const tall = world.buildings.find((b) => b.height > 10)!
    expect(tall.height).toBeCloseTo(15)
    expect(tall.footprint.length).toBeGreaterThanOrEqual(3)
  })

  it('places geometry in local meters relative to center', () => {
    const road = world.roads[0]
    // node 1 is the center -> near origin
    const hasOrigin = road.points.some((p) => Math.abs(p.x) < 1 && Math.abs(p.z) < 1)
    expect(hasOrigin).toBe(true)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/geo/parse.test.ts`
Expected: FAIL — cannot find module `parse`.

- [ ] **Step 4: Create `src/geo/parse.ts`**

```ts
import type { Projector } from './project'
import type { Building, Road, RoadKind, Vec2, WorldData } from './types'

export interface OverpassElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  nodes?: number[]
  tags?: Record<string, string>
}
export interface OverpassResponse { elements: OverpassElement[] }

const HIGHWAY_MAP: Record<string, RoadKind> = {
  motorway: 'motorway', trunk: 'motorway',
  primary: 'primary',
  secondary: 'secondary', tertiary: 'secondary',
  residential: 'residential', living_street: 'residential',
  service: 'service',
  footway: 'path', path: 'path', pedestrian: 'path', cycleway: 'path',
}

const METERS_PER_LEVEL = 3
const DEFAULT_BUILDING_HEIGHT = 9

export function classifyRoad(highway: string | undefined): RoadKind {
  if (!highway) return 'other'
  return HIGHWAY_MAP[highway] ?? 'other'
}

export function buildingHeight(tags: Record<string, string>): number {
  const h = parseFloat(tags.height)
  if (!Number.isNaN(h) && h > 0) return h
  const levels = parseFloat(tags['building:levels'])
  if (!Number.isNaN(levels) && levels > 0) return levels * METERS_PER_LEVEL
  return DEFAULT_BUILDING_HEIGHT
}

export function parseOsm(json: OverpassResponse, projector: Projector): WorldData {
  const nodes = new Map<number, Vec2>()
  for (const el of json.elements) {
    if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined) {
      nodes.set(el.id, projector.toLocal({ lat: el.lat, lon: el.lon }))
    }
  }

  const roads: Road[] = []
  const buildings: Building[] = []

  for (const el of json.elements) {
    if (el.type !== 'way' || !el.nodes || el.nodes.length < 2) continue
    const tags = el.tags ?? {}
    const points = el.nodes.map((id) => nodes.get(id)).filter((p): p is Vec2 => !!p)
    if (points.length < 2) continue

    if (tags.building) {
      const ring = points.length > 2 ? points.slice(0, dropClosingPoint(points)) : points
      if (ring.length >= 3) buildings.push({ footprint: ring, height: buildingHeight(tags) })
    } else if (tags.highway) {
      roads.push({ points, kind: classifyRoad(tags.highway) })
    }
  }

  return { roads, buildings }
}

/** OSM closed ways repeat the first node last; drop it for a clean polygon. */
function dropClosingPoint(points: Vec2[]): number {
  const first = points[0]
  const last = points[points.length - 1]
  return first.x === last.x && first.z === last.z ? points.length - 1 : points.length
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/geo/parse.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/geo/parse.ts test/geo/parse.test.ts test/fixtures/overpass-small.json
git commit -m "feat(geo): parse Overpass JSON into roads and buildings"
```

---

### Task 4: Overpass query + fetch

**Files:**
- Create: `src/geo/overpass.ts`
- Test: `test/geo/overpass.test.ts`

**Interfaces:**
- Consumes: `LatLon` (Task 2), `OverpassResponse` (Task 3).
- Produces:
  - `interface BBox { south: number; west: number; north: number; east: number }`
  - `function bboxAround(center: LatLon, radiusMeters: number): BBox`
  - `function overpassQuery(bbox: BBox): string`
  - `async function fetchOsm(bbox: BBox): Promise<OverpassResponse>`

- [ ] **Step 1: Write the failing test `test/geo/overpass.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { bboxAround, overpassQuery } from '../../src/geo/overpass'

describe('bboxAround', () => {
  it('builds a symmetric box around the center', () => {
    const b = bboxAround({ lat: 41.7151, lon: 44.8271 }, 1000)
    expect(b.south).toBeLessThan(41.7151)
    expect(b.north).toBeGreaterThan(41.7151)
    expect(b.west).toBeLessThan(44.8271)
    expect(b.east).toBeGreaterThan(44.8271)
    // ~1km north offset is ~0.009 deg lat
    expect(b.north - 41.7151).toBeCloseTo(0.009, 2)
  })
})

describe('overpassQuery', () => {
  const q = overpassQuery({ south: 41.71, west: 44.82, north: 41.72, east: 44.83 })
  it('requests highways and buildings within the bbox', () => {
    expect(q).toContain('41.71,44.82,41.72,44.83')
    expect(q).toContain('highway')
    expect(q).toContain('building')
    expect(q).toContain('out')
  })
  it('asks for json output', () => {
    expect(q).toContain('[out:json]')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/geo/overpass.test.ts`
Expected: FAIL — cannot find module `overpass`.

- [ ] **Step 3: Create `src/geo/overpass.ts`**

```ts
import type { LatLon } from './types'
import type { OverpassResponse } from './parse'

export interface BBox { south: number; west: number; north: number; east: number }

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const M_PER_DEG_LAT = 111320

export function bboxAround(center: LatLon, radiusMeters: number): BBox {
  const dLat = radiusMeters / M_PER_DEG_LAT
  const dLon = radiusMeters / (M_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180))
  return {
    south: center.lat - dLat,
    north: center.lat + dLat,
    west: center.lon - dLon,
    east: center.lon + dLon,
  }
}

export function overpassQuery(b: BBox): string {
  const box = `${b.south},${b.west},${b.north},${b.east}`
  return `[out:json][timeout:25];
(
  way["highway"](${box});
  way["building"](${box});
);
out body;
>;
out skel qt;`
}

export async function fetchOsm(bbox: BBox): Promise<OverpassResponse> {
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(overpassQuery(bbox)),
  })
  if (!res.ok) throw new Error(`Overpass error ${res.status}`)
  return (await res.json()) as OverpassResponse
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/geo/overpass.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/geo/overpass.ts test/geo/overpass.test.ts
git commit -m "feat(geo): overpass bbox, query builder, and fetch"
```

---

### Task 5: Geocode city name via Nominatim

**Files:**
- Create: `src/geo/geocode.ts`
- Test: `test/geo/geocode.test.ts`

**Interfaces:**
- Consumes: `LatLon` (Task 2).
- Produces:
  - `function nominatimUrl(query: string): string`
  - `function parseNominatim(json: unknown): LatLon` (throws `Error('city not found')` on empty)
  - `async function geocode(query: string): Promise<LatLon>`

- [ ] **Step 1: Write the failing test `test/geo/geocode.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { nominatimUrl, parseNominatim } from '../../src/geo/geocode'

describe('nominatimUrl', () => {
  it('encodes the query and asks for json', () => {
    const url = nominatimUrl('Тбилиси')
    expect(url).toContain('format=json')
    expect(url).toContain(encodeURIComponent('Тбилиси'))
    expect(url).toContain('limit=1')
  })
})

describe('parseNominatim', () => {
  it('reads lat/lon from the first result', () => {
    const ll = parseNominatim([{ lat: '41.7151', lon: '44.8271' }])
    expect(ll.lat).toBeCloseTo(41.7151)
    expect(ll.lon).toBeCloseTo(44.8271)
  })
  it('throws when no results', () => {
    expect(() => parseNominatim([])).toThrow('city not found')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/geo/geocode.test.ts`
Expected: FAIL — cannot find module `geocode`.

- [ ] **Step 3: Create `src/geo/geocode.ts`**

```ts
import type { LatLon } from './types'

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

export function nominatimUrl(query: string): string {
  return `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(query)}`
}

interface NominatimHit { lat: string; lon: string }

export function parseNominatim(json: unknown): LatLon {
  const arr = json as NominatimHit[]
  if (!Array.isArray(arr) || arr.length === 0) throw new Error('city not found')
  return { lat: parseFloat(arr[0].lat), lon: parseFloat(arr[0].lon) }
}

/** Accepts "lat,lon" directly, otherwise geocodes the free-text query. */
export async function geocode(query: string): Promise<LatLon> {
  const coord = query.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/)
  if (coord) return { lat: parseFloat(coord[1]), lon: parseFloat(coord[2]) }
  const res = await fetch(nominatimUrl(query), { headers: { 'Accept-Language': 'en' } })
  if (!res.ok) throw new Error(`Geocoding error ${res.status}`)
  return parseNominatim(await res.json())
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/geo/geocode.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/geo/geocode.ts test/geo/geocode.test.ts
git commit -m "feat(geo): Nominatim geocoding with coordinate passthrough"
```

---

### Task 6: IndexedDB cache for OSM responses

**Files:**
- Create: `src/geo/cache.ts`
- Test: `test/geo/cache.test.ts`

**Interfaces:**
- Consumes: `BBox` (Task 4), `OverpassResponse` (Task 3).
- Produces:
  - `function bboxKey(bbox: BBox): string` (rounded, stable)
  - `async function cacheGet(key: string): Promise<OverpassResponse | undefined>`
  - `async function cachePut(key: string, value: OverpassResponse): Promise<void>`

- [ ] **Step 1: Write the failing test `test/geo/cache.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { bboxKey } from '../../src/geo/cache'

describe('bboxKey', () => {
  it('is stable and rounded for near-identical bboxes', () => {
    const a = bboxKey({ south: 41.710001, west: 44.820001, north: 41.72, east: 44.83 })
    const b = bboxKey({ south: 41.710002, west: 44.820002, north: 41.72, east: 44.83 })
    expect(a).toBe(b)
  })
  it('differs for clearly different bboxes', () => {
    const a = bboxKey({ south: 41.71, west: 44.82, north: 41.72, east: 44.83 })
    const b = bboxKey({ south: 40.71, west: 43.82, north: 40.72, east: 43.83 })
    expect(a).not.toBe(b)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/geo/cache.test.ts`
Expected: FAIL — cannot find module `cache`.

- [ ] **Step 3: Create `src/geo/cache.ts`**

```ts
import type { BBox } from './overpass'
import type { OverpassResponse } from './parse'

const DB_NAME = 'race-the-city'
const STORE = 'osm'

export function bboxKey(b: BBox): string {
  const r = (n: number) => n.toFixed(4)
  return `${r(b.south)},${r(b.west)},${r(b.north)},${r(b.east)}`
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function cacheGet(key: string): Promise<OverpassResponse | undefined> {
  try {
    const db = await openDb()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
      tx.onsuccess = () => resolve(tx.result as OverpassResponse | undefined)
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    return undefined // caching is best-effort
  }
}

export async function cachePut(key: string, value: OverpassResponse): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key)
      tx.onsuccess = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    /* best-effort */
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/geo/cache.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/geo/cache.ts test/geo/cache.test.ts
git commit -m "feat(geo): IndexedDB best-effort cache keyed by bbox"
```

---

### Task 7: Elevation providers (flat + terrarium)

**Files:**
- Create: `src/terrain/provider.ts`, `src/terrain/flat.ts`, `src/terrain/terrarium.ts`
- Test: `test/terrain/terrarium.test.ts`

**Interfaces:**
- Consumes: `LatLon`, `Vec2`, `Projector` (Task 2), `BBox` (Task 4).
- Produces:
  - `interface ElevationProvider { heightAt(x: number, z: number): number }`
  - `class FlatProvider implements ElevationProvider` (always 0)
  - `function decodeTerrarium(r: number, g: number, b: number): number`
  - `function lonLatToTilePixel(lat: number, lon: number, zoom: number): { px: number; py: number }`
  - `function sampleGrid(heights: Float32Array, w: number, h: number, fx: number, fy: number): number` (bilinear)
  - `async function loadTerrarium(center: LatLon, bbox: BBox, projector: Projector, zoom?: number): Promise<ElevationProvider>` (throws on network failure; caller falls back to `FlatProvider`)

- [ ] **Step 1: Create `src/terrain/provider.ts`**

```ts
export interface ElevationProvider {
  /** Elevation in meters at local ground coordinates (x east, z south). */
  heightAt(x: number, z: number): number
}
```

- [ ] **Step 2: Create `src/terrain/flat.ts`**

```ts
import type { ElevationProvider } from './provider'

export class FlatProvider implements ElevationProvider {
  heightAt(): number {
    return 0
  }
}
```

- [ ] **Step 3: Write the failing test `test/terrain/terrarium.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { decodeTerrarium, lonLatToTilePixel, sampleGrid } from '../../src/terrain/terrarium'

describe('decodeTerrarium', () => {
  it('decodes sea level (0m) from the reference encoding', () => {
    // 0m => value 32768 => R=128, G=0, B=0
    expect(decodeTerrarium(128, 0, 0)).toBeCloseTo(0, 3)
  })
  it('decodes a positive elevation', () => {
    // 1000m => 33768 => R=131 (131*256=33536), G=232, B=0 => 33768-32768=1000
    expect(decodeTerrarium(131, 232, 0)).toBeCloseTo(1000, 3)
  })
})

describe('lonLatToTilePixel', () => {
  it('is monotonic: east increases px, north decreases py', () => {
    const a = lonLatToTilePixel(41.7151, 44.8271, 14)
    const east = lonLatToTilePixel(41.7151, 44.8371, 14)
    const north = lonLatToTilePixel(41.7251, 44.8271, 14)
    expect(east.px).toBeGreaterThan(a.px)
    expect(north.py).toBeLessThan(a.py)
  })
})

describe('sampleGrid (bilinear)', () => {
  const heights = new Float32Array([0, 10, 0, 10]) // 2x2: left col 0, right col 10
  it('returns exact grid values at integer coords', () => {
    expect(sampleGrid(heights, 2, 2, 0, 0)).toBeCloseTo(0)
    expect(sampleGrid(heights, 2, 2, 1, 0)).toBeCloseTo(10)
  })
  it('interpolates between columns', () => {
    expect(sampleGrid(heights, 2, 2, 0.5, 0)).toBeCloseTo(5)
  })
  it('clamps out-of-range coordinates', () => {
    expect(sampleGrid(heights, 2, 2, -5, -5)).toBeCloseTo(0)
    expect(sampleGrid(heights, 2, 2, 99, 99)).toBeCloseTo(10)
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run test/terrain/terrarium.test.ts`
Expected: FAIL — cannot find module `terrarium`.

- [ ] **Step 5: Create `src/terrain/terrarium.ts`**

```ts
import type { LatLon, Vec2 } from '../geo/types'
import type { Projector } from '../geo/project'
import type { BBox } from '../geo/overpass'
import type { ElevationProvider } from './provider'

const TILE_URL = (z: number, x: number, y: number) =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`
const TILE_SIZE = 256

export function decodeTerrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768
}

/** Global pixel coordinate (tileIndex*256 + inner) in the slippy-map grid. */
export function lonLatToTilePixel(lat: number, lon: number, zoom: number): { px: number; py: number } {
  const n = Math.pow(2, zoom)
  const x = ((lon + 180) / 360) * n
  const latRad = (lat * Math.PI) / 180
  const y = ((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n
  return { px: x * TILE_SIZE, py: y * TILE_SIZE }
}

/** Bilinear sample of a row-major grid, clamped to edges. fx/fy in grid-cell units. */
export function sampleGrid(heights: Float32Array, w: number, h: number, fx: number, fy: number): number {
  const cx = Math.max(0, Math.min(w - 1, fx))
  const cy = Math.max(0, Math.min(h - 1, fy))
  const x0 = Math.floor(cx), y0 = Math.floor(cy)
  const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1)
  const tx = cx - x0, ty = cy - y0
  const h00 = heights[y0 * w + x0], h10 = heights[y0 * w + x1]
  const h01 = heights[y1 * w + x0], h11 = heights[y1 * w + x1]
  const top = h00 + (h10 - h00) * tx
  const bot = h01 + (h11 - h01) * tx
  return top + (bot - top) * ty
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`tile load failed: ${url}`))
    img.src = url
  })
}

/**
 * Builds an elevation grid covering bbox by stitching Terrarium tiles into a
 * single decoded height array, then samples it per local (x,z).
 */
export async function loadTerrarium(
  center: LatLon,
  bbox: BBox,
  projector: Projector,
  zoom = 14,
): Promise<ElevationProvider> {
  const nw = lonLatToTilePixel(bbox.north, bbox.west, zoom)
  const se = lonLatToTilePixel(bbox.south, bbox.east, zoom)
  const minTileX = Math.floor(nw.px / TILE_SIZE)
  const maxTileX = Math.floor(se.px / TILE_SIZE)
  const minTileY = Math.floor(nw.py / TILE_SIZE)
  const maxTileY = Math.floor(se.py / TILE_SIZE)

  const cols = maxTileX - minTileX + 1
  const rows = maxTileY - minTileY + 1
  const w = cols * TILE_SIZE
  const h = rows * TILE_SIZE
  const heights = new Float32Array(w * h)

  const canvas = document.createElement('canvas')
  canvas.width = TILE_SIZE
  canvas.height = TILE_SIZE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!

  for (let ty = minTileY; ty <= maxTileY; ty++) {
    for (let tx = minTileX; tx <= maxTileX; tx++) {
      const img = await loadImage(TILE_URL(zoom, tx, ty))
      ctx.drawImage(img, 0, 0)
      const data = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data
      const ox = (tx - minTileX) * TILE_SIZE
      const oy = (ty - minTileY) * TILE_SIZE
      for (let py = 0; py < TILE_SIZE; py++) {
        for (let px = 0; px < TILE_SIZE; px++) {
          const i = (py * TILE_SIZE + px) * 4
          heights[(oy + py) * w + (ox + px)] = decodeTerrarium(data[i], data[i + 1], data[i + 2])
        }
      }
    }
  }

  const originPx = minTileX * TILE_SIZE
  const originPy = minTileY * TILE_SIZE

  return {
    heightAt(x: number, z: number): number {
      const ll = projector.toLatLon({ x, z } as Vec2)
      const gp = lonLatToTilePixel(ll.lat, ll.lon, zoom)
      return sampleGrid(heights, w, h, gp.px - originPx, gp.py - originPy)
    },
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run test/terrain/terrarium.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/terrain/ test/terrain/terrarium.test.ts
git commit -m "feat(terrain): flat + terrarium elevation providers"
```

---

### Task 8: Ground mesh from elevation

**Files:**
- Create: `src/world/ground.ts`
- Modify: `src/app/main.ts` (temporary visual harness)

**Interfaces:**
- Consumes: `ElevationProvider` (Task 7).
- Produces:
  - `function buildGround(provider: ElevationProvider, halfSize: number, segments?: number): THREE.Mesh`

- [ ] **Step 1: Create `src/world/ground.ts`**

```ts
import * as THREE from 'three'
import type { ElevationProvider } from '../terrain/provider'

/**
 * A halfSize*2 square ground mesh centered at the origin, displaced in Y by the
 * elevation provider. `segments` controls resolution (verts per side = segments+1).
 */
export function buildGround(provider: ElevationProvider, halfSize: number, segments = 128): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(halfSize * 2, halfSize * 2, segments, segments)
  geo.rotateX(-Math.PI / 2) // XY plane -> XZ ground plane
  const pos = geo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    pos.setY(i, provider.heightAt(x, z))
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  const mat = new THREE.MeshStandardMaterial({ color: 0x5a7d4f, flatShading: true })
  return new THREE.Mesh(geo, mat)
}
```

- [ ] **Step 2: Add a temporary visual harness in `src/app/main.ts`**

Replace the cube block with a sine-wave fake provider so ground displacement is visible without network:

```ts
import { buildGround } from '../world/ground'

const fake = { heightAt: (x: number, z: number) => Math.sin(x * 0.05) * 4 + Math.cos(z * 0.05) * 4 }
const ground = buildGround(fake, 200, 128)
scene.add(ground)
camera.position.set(0, 80, 160)
camera.lookAt(0, 0, 0)
```

- [ ] **Step 3: Verify visually**

Run: `npm run dev`
Expected: a green rolling hilly surface (sine waves), flat-shaded facets visible.

- [ ] **Step 4: Commit**

```bash
git add src/world/ground.ts src/app/main.ts
git commit -m "feat(world): displaced ground mesh from elevation provider"
```

---

### Task 9: Building meshes + footprints

**Files:**
- Create: `src/world/buildings.ts`
- Modify: `src/app/main.ts` (visual harness)

**Interfaces:**
- Consumes: `Building`, `Vec2` (Task 2), `ElevationProvider` (Task 7).
- Produces:
  - `function buildBuildings(buildings: Building[], provider: ElevationProvider): { mesh: THREE.Object3D; footprints: Vec2[][] }`

- [ ] **Step 1: Create `src/world/buildings.ts`**

```ts
import * as THREE from 'three'
import type { Building, Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'

const COLORS = [0xcbb7a3, 0xbfae99, 0xd4c4b0, 0xc2b280]

/**
 * Extrudes each footprint from its ground level up by its height. Returns one
 * merged-material group of meshes and the flat footprints for the physics grid.
 */
export function buildBuildings(
  buildings: Building[],
  provider: ElevationProvider,
): { mesh: THREE.Object3D; footprints: Vec2[][] } {
  const group = new THREE.Group()
  const footprints: Vec2[][] = []

  for (const b of buildings) {
    if (b.footprint.length < 3) continue
    const shape = new THREE.Shape()
    shape.moveTo(b.footprint[0].x, b.footprint[0].z)
    for (let i = 1; i < b.footprint.length; i++) shape.lineTo(b.footprint[i].x, b.footprint[i].z)
    shape.closePath()

    const geo = new THREE.ExtrudeGeometry(shape, { depth: b.height, bevelEnabled: false })
    geo.rotateX(-Math.PI / 2) // extrude along +Y

    // Sit the base on the ground at the footprint's average elevation.
    const base = averageGround(b.footprint, provider)
    geo.translate(0, base, 0)

    const color = COLORS[footprints.length % COLORS.length]
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, flatShading: true }))
    group.add(mesh)
    footprints.push(b.footprint)
  }

  return { mesh: group, footprints }
}

function averageGround(ring: Vec2[], provider: ElevationProvider): number {
  let sum = 0
  for (const p of ring) sum += provider.heightAt(p.x, p.z)
  return sum / ring.length
}
```

- [ ] **Step 2: Add buildings to the visual harness in `src/app/main.ts`**

```ts
import { buildBuildings } from '../world/buildings'
import type { Building } from '../geo/types'

const demoBuildings: Building[] = [
  { footprint: [{ x: -20, z: -20 }, { x: 0, z: -20 }, { x: 0, z: 0 }, { x: -20, z: 0 }], height: 30 },
  { footprint: [{ x: 10, z: 10 }, { x: 30, z: 10 }, { x: 30, z: 40 }, { x: 10, z: 40 }], height: 15 },
]
const { mesh: buildingsMesh } = buildBuildings(demoBuildings, fake)
scene.add(buildingsMesh)
```

- [ ] **Step 3: Verify visually**

Run: `npm run dev`
Expected: two flat-shaded box buildings of different heights sitting on the hilly ground.

- [ ] **Step 4: Commit**

```bash
git add src/world/buildings.ts src/app/main.ts
git commit -m "feat(world): extruded building meshes with footprints for physics"
```

---

### Task 10: Road ribbons draped on terrain

**Files:**
- Create: `src/world/roads.ts`
- Test: `test/world/roads.test.ts`
- Modify: `src/app/main.ts` (visual harness)

**Interfaces:**
- Consumes: `Road`, `RoadKind`, `Vec2` (Task 2), `ElevationProvider` (Task 7).
- Produces:
  - `function roadWidth(kind: RoadKind): number`
  - `function buildRoads(roads: Road[], provider: ElevationProvider): THREE.Object3D`

- [ ] **Step 1: Write the failing test `test/world/roads.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { roadWidth } from '../../src/world/roads'

describe('roadWidth', () => {
  it('makes motorways wider than residential streets', () => {
    expect(roadWidth('motorway')).toBeGreaterThan(roadWidth('residential'))
  })
  it('makes paths the narrowest', () => {
    expect(roadWidth('path')).toBeLessThan(roadWidth('service'))
  })
  it('returns a positive width for every kind', () => {
    for (const k of ['motorway', 'primary', 'secondary', 'residential', 'service', 'path', 'other'] as const) {
      expect(roadWidth(k)).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/world/roads.test.ts`
Expected: FAIL — cannot find module `roads`.

- [ ] **Step 3: Create `src/world/roads.ts`**

```ts
import * as THREE from 'three'
import type { Road, RoadKind, Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'

const WIDTHS: Record<RoadKind, number> = {
  motorway: 12, primary: 9, secondary: 7, residential: 5, service: 3.5, path: 2, other: 4,
}
const ROAD_Y_OFFSET = 0.15 // lift slightly above ground to avoid z-fighting

export function roadWidth(kind: RoadKind): number {
  return WIDTHS[kind]
}

/** Builds flat quad ribbons along each polyline, following terrain height. */
export function buildRoads(roads: Road[], provider: ElevationProvider): THREE.Object3D {
  const positions: number[] = []
  for (const road of roads) {
    const hw = roadWidth(road.kind) / 2
    for (let i = 0; i < road.points.length - 1; i++) {
      emitSegment(positions, road.points[i], road.points[i + 1], hw, provider)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.computeVertexNormals()
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a3a3f, flatShading: true, side: THREE.DoubleSide })
  return new THREE.Mesh(geo, mat)
}

function emitSegment(out: number[], a: Vec2, b: Vec2, hw: number, provider: ElevationProvider): void {
  const dx = b.x - a.x, dz = b.z - a.z
  const len = Math.hypot(dx, dz) || 1
  const nx = (-dz / len) * hw // perpendicular
  const nz = (dx / len) * hw
  const y = (v: Vec2) => provider.heightAt(v.x, v.z) + ROAD_Y_OFFSET
  const aL: Vec2 = { x: a.x + nx, z: a.z + nz }, aR: Vec2 = { x: a.x - nx, z: a.z - nz }
  const bL: Vec2 = { x: b.x + nx, z: b.z + nz }, bR: Vec2 = { x: b.x - nx, z: b.z - nz }
  push(out, aL, y(aL)); push(out, bL, y(bL)); push(out, bR, y(bR))
  push(out, aL, y(aL)); push(out, bR, y(bR)); push(out, aR, y(aR))
}

function push(out: number[], p: Vec2, y: number): void {
  out.push(p.x, y, p.z)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/world/roads.test.ts`
Expected: PASS.

- [ ] **Step 5: Add roads to the visual harness in `src/app/main.ts`**

```ts
import { buildRoads } from '../world/roads'
import type { Road } from '../geo/types'

const demoRoads: Road[] = [
  { kind: 'motorway', points: [{ x: -150, z: 0 }, { x: 150, z: 0 }] },
  { kind: 'residential', points: [{ x: 0, z: -150 }, { x: 0, z: 150 }] },
]
scene.add(buildRoads(demoRoads, fake))
```

- [ ] **Step 6: Verify visually**

Run: `npm run dev`
Expected: a wide dark road crossing a narrower one, both hugging the hilly ground.

- [ ] **Step 7: Commit**

```bash
git add src/world/roads.ts test/world/roads.test.ts src/app/main.ts
git commit -m "feat(world): terrain-draped road ribbons with width by kind"
```

---

### Task 11: Spatial grid over footprints

**Files:**
- Create: `src/physics/grid.ts`
- Test: `test/physics/grid.test.ts`

**Interfaces:**
- Consumes: `Vec2` (Task 2).
- Produces:
  - `class SpatialGrid { constructor(footprints: Vec2[][], cellSize?: number); near(x: number, z: number): Vec2[][] }`

- [ ] **Step 1: Write the failing test `test/physics/grid.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { SpatialGrid } from '../../src/physics/grid'
import type { Vec2 } from '../../src/geo/types'

const square = (cx: number, cz: number): Vec2[] => [
  { x: cx - 1, z: cz - 1 }, { x: cx + 1, z: cz - 1 },
  { x: cx + 1, z: cz + 1 }, { x: cx - 1, z: cz + 1 },
]

describe('SpatialGrid', () => {
  it('returns a footprint near its own location', () => {
    const grid = new SpatialGrid([square(0, 0)], 10)
    expect(grid.near(0, 0).length).toBe(1)
  })
  it('does not return a footprint that is far away', () => {
    const grid = new SpatialGrid([square(0, 0), square(1000, 1000)], 10)
    const near = grid.near(0, 0)
    expect(near.length).toBe(1)
    expect(near[0]).toEqual(square(0, 0))
  })
  it('returns neighbors in the adjacent cells', () => {
    const grid = new SpatialGrid([square(0, 0), square(12, 0)], 10)
    // querying at x=8 should see both because footprints span multiple cells
    expect(grid.near(8, 0).length).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/physics/grid.test.ts`
Expected: FAIL — cannot find module `grid`.

- [ ] **Step 3: Create `src/physics/grid.ts`**

```ts
import type { Vec2 } from '../geo/types'

/** Uniform grid indexing polygon footprints by the cells their bbox overlaps. */
export class SpatialGrid {
  private readonly cell: number
  private readonly buckets = new Map<string, Vec2[][]>()

  constructor(footprints: Vec2[][], cellSize = 25) {
    this.cell = cellSize
    for (const fp of footprints) this.insert(fp)
  }

  private key(cx: number, cz: number): string {
    return `${cx},${cz}`
  }

  private insert(fp: Vec2[]): void {
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity
    for (const p of fp) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.z < minZ) minZ = p.z
      if (p.z > maxZ) maxZ = p.z
    }
    for (let cx = Math.floor(minX / this.cell); cx <= Math.floor(maxX / this.cell); cx++) {
      for (let cz = Math.floor(minZ / this.cell); cz <= Math.floor(maxZ / this.cell); cz++) {
        const k = this.key(cx, cz)
        const bucket = this.buckets.get(k) ?? []
        bucket.push(fp)
        this.buckets.set(k, bucket)
      }
    }
  }

  /** Footprints in the query cell and its 8 neighbors, de-duplicated. */
  near(x: number, z: number): Vec2[][] {
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell)
    const seen = new Set<Vec2[]>()
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const bucket = this.buckets.get(this.key(cx + dx, cz + dz))
        if (bucket) for (const fp of bucket) seen.add(fp)
      }
    }
    return [...seen]
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/physics/grid.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/physics/grid.ts test/physics/grid.test.ts
git commit -m "feat(physics): uniform spatial grid over building footprints"
```

---

### Task 12: Circle-vs-polygon collision resolution

**Files:**
- Create: `src/physics/collide.ts`
- Test: `test/physics/collide.test.ts`

**Interfaces:**
- Consumes: `Vec2` (Task 2), `SpatialGrid` (Task 11).
- Produces:
  - `function pointInPolygon(x: number, z: number, poly: Vec2[]): boolean`
  - `function resolveCircle(x: number, z: number, radius: number, grid: SpatialGrid): Vec2` — returns a corrected position pushed out of any overlapping footprint.

- [ ] **Step 1: Write the failing test `test/physics/collide.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { pointInPolygon, resolveCircle } from '../../src/physics/collide'
import { SpatialGrid } from '../../src/physics/grid'
import type { Vec2 } from '../../src/geo/types'

const box: Vec2[] = [
  { x: -10, z: -10 }, { x: 10, z: -10 }, { x: 10, z: 10 }, { x: -10, z: 10 },
]

describe('pointInPolygon', () => {
  it('detects inside and outside', () => {
    expect(pointInPolygon(0, 0, box)).toBe(true)
    expect(pointInPolygon(50, 50, box)).toBe(false)
  })
})

describe('resolveCircle', () => {
  const grid = new SpatialGrid([box], 25)

  it('leaves a car outside the building untouched', () => {
    const p = resolveCircle(40, 0, 2, grid)
    expect(p.x).toBeCloseTo(40)
    expect(p.z).toBeCloseTo(0)
  })

  it('pushes a car that entered the building back outside', () => {
    const p = resolveCircle(8, 0, 2, grid) // inside near the +x wall
    expect(p.x).toBeGreaterThan(10) // pushed out past the wall + radius
    expect(pointInPolygon(p.x, p.z, box)).toBe(false)
  })

  it('pushes out along the nearest edge (keeps the other axis roughly stable)', () => {
    const p = resolveCircle(9, 3, 2, grid) // closest to +x wall
    expect(p.x).toBeGreaterThan(10)
    expect(Math.abs(p.z - 3)).toBeLessThan(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/physics/collide.test.ts`
Expected: FAIL — cannot find module `collide`.

- [ ] **Step 3: Create `src/physics/collide.ts`**

```ts
import type { Vec2 } from '../geo/types'
import type { SpatialGrid } from './grid'

export function pointInPolygon(x: number, z: number, poly: Vec2[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, zi = poly[i].z
    const xj = poly[j].x, zj = poly[j].z
    const intersect = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/** Nearest point on segment ab to p, plus the squared distance to it. */
function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): { point: Vec2; dist2: number } {
  const abx = b.x - a.x, abz = b.z - a.z
  const apx = p.x - a.x, apz = p.z - a.z
  const len2 = abx * abx + abz * abz || 1
  let t = (apx * abx + apz * abz) / len2
  t = Math.max(0, Math.min(1, t))
  const point = { x: a.x + abx * t, z: a.z + abz * t }
  const dx = p.x - point.x, dz = p.z - point.z
  return { point, dist2: dx * dx + dz * dz }
}

/**
 * If (x,z) with the given radius overlaps a nearby footprint, push it out to
 * the closest polygon edge plus the radius. Sliding falls out naturally: only
 * the penetration component is removed, tangential motion is preserved.
 */
export function resolveCircle(x: number, z: number, radius: number, grid: SpatialGrid): Vec2 {
  let pos: Vec2 = { x, z }
  for (const poly of grid.near(x, z)) {
    const inside = pointInPolygon(pos.x, pos.z, poly)
    let best: { point: Vec2; dist2: number } | null = null
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const c = closestOnSegment(pos, poly[j], poly[i])
      if (!best || c.dist2 < best.dist2) best = c
    }
    if (!best) continue
    const dist = Math.sqrt(best.dist2)
    if (inside) {
      // shove outward along edge normal (pos -> edge direction), out past the wall
      const nx = (pos.x - best.point.x) / (dist || 1)
      const nz = (pos.z - best.point.z) / (dist || 1)
      pos = { x: best.point.x + nx * radius, z: best.point.z + nz * radius }
    } else if (dist < radius) {
      const nx = (pos.x - best.point.x) / (dist || 1)
      const nz = (pos.z - best.point.z) / (dist || 1)
      pos = { x: best.point.x + nx * radius, z: best.point.z + nz * radius }
    }
  }
  return pos
}
```

Note on the inside push-out: when the circle center is inside the polygon, `pos - closestEdgePoint` points *inward*, so pushing along it would move deeper. Fix by inverting when inside:

```ts
    if (inside) {
      const nx = (best.point.x - pos.x) / (dist || 1)
      const nz = (best.point.z - pos.z) / (dist || 1)
      pos = { x: best.point.x + nx * radius, z: best.point.z + nz * radius }
    }
```

Use this inside-branch version (the outward normal from an interior point is `edgePoint - pos`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/physics/collide.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/physics/collide.ts test/physics/collide.test.ts
git commit -m "feat(physics): circle-vs-polygon push-out with sliding"
```

---

### Task 13: Arcade car + keyboard input

**Files:**
- Create: `src/vehicle/car.ts`, `src/vehicle/input.ts`
- Test: `test/vehicle/car.test.ts`

**Interfaces:**
- Consumes: `Vec2` (Task 2), `SpatialGrid` (Task 11), `resolveCircle` (Task 12), `ElevationProvider` (Task 7).
- Produces:
  - `interface CarState { x: number; z: number; y: number; heading: number; speed: number }`
  - `interface CarInput { throttle: number; steer: number; brake: boolean }` (throttle/steer in −1..1)
  - `function createCar(x?: number, z?: number): CarState`
  - `function stepCar(car: CarState, input: CarInput, dt: number, grid: SpatialGrid, provider: ElevationProvider): CarState`
  - `class Keyboard { constructor(); read(): CarInput; dispose(): void }`

- [ ] **Step 1: Write the failing test `test/vehicle/car.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { createCar, stepCar } from '../../src/vehicle/car'
import { SpatialGrid } from '../../src/physics/grid'
import { FlatProvider } from '../../src/terrain/flat'
import type { Vec2 } from '../../src/geo/types'

const emptyGrid = new SpatialGrid([], 25)
const flat = new FlatProvider()
const NO_INPUT = { throttle: 0, steer: 0, brake: false }

describe('stepCar', () => {
  it('accelerates forward under throttle', () => {
    let car = createCar()
    car = stepCar(car, { throttle: 1, steer: 0, brake: false }, 0.5, emptyGrid, flat)
    expect(car.speed).toBeGreaterThan(0)
  })

  it('coasts to a stop from friction', () => {
    let car = createCar()
    car.speed = 10
    for (let i = 0; i < 200; i++) car = stepCar(car, NO_INPUT, 0.1, emptyGrid, flat)
    expect(Math.abs(car.speed)).toBeLessThan(0.5)
  })

  it('turns heading while moving', () => {
    let car = createCar()
    car.speed = 5
    const before = car.heading
    car = stepCar(car, { throttle: 0, steer: 1, brake: false }, 0.5, emptyGrid, flat)
    expect(car.heading).not.toBeCloseTo(before)
  })

  it('does not turn while stopped', () => {
    let car = createCar()
    const before = car.heading
    car = stepCar(car, { throttle: 0, steer: 1, brake: false }, 0.5, emptyGrid, flat)
    expect(car.heading).toBeCloseTo(before)
  })

  it('is blocked from driving into a building', () => {
    const box: Vec2[] = [{ x: 5, z: -5 }, { x: 15, z: -5 }, { x: 15, z: 5 }, { x: 5, z: 5 }]
    const grid = new SpatialGrid([box], 25)
    let car = createCar(0, 0)
    car.heading = 0 // faces +x (see convention in impl)
    car.speed = 30
    for (let i = 0; i < 30; i++) car = stepCar(car, { throttle: 1, steer: 0, brake: false }, 0.1, grid, flat)
    expect(car.x).toBeLessThan(5) // never penetrates the near wall
  })

  it('follows terrain height in Y', () => {
    const ramp = { heightAt: (x: number) => x } // y = x
    let car = createCar(0, 0)
    car.speed = 10
    car.heading = 0
    car = stepCar(car, { throttle: 1, steer: 0, brake: false }, 0.5, emptyGrid, ramp)
    expect(car.y).toBeGreaterThan(0)
    expect(car.y).toBeCloseTo(car.x, 5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/vehicle/car.test.ts`
Expected: FAIL — cannot find module `car`.

- [ ] **Step 3: Create `src/vehicle/car.ts`**

```ts
import type { SpatialGrid } from '../physics/grid'
import { resolveCircle } from '../physics/collide'
import type { ElevationProvider } from '../terrain/provider'

export interface CarState { x: number; z: number; y: number; heading: number; speed: number }
export interface CarInput { throttle: number; steer: number; brake: boolean }

const ACCEL = 40 // m/s^2 at full throttle
const BRAKE = 60
const FRICTION = 4 // per second velocity decay
const MAX_SPEED = 60
const TURN_RATE = 1.8 // rad/s at full steer and full speed
const CAR_RADIUS = 2

export function createCar(x = 0, z = 0): CarState {
  return { x, z, y: 0, heading: 0, speed: 0 }
}

/** heading 0 faces +x; +heading rotates toward +z. */
export function stepCar(
  car: CarState,
  input: CarInput,
  dt: number,
  grid: SpatialGrid,
  provider: ElevationProvider,
): CarState {
  let speed = car.speed
  speed += input.throttle * ACCEL * dt
  if (input.brake) speed -= Math.sign(speed) * BRAKE * dt
  speed -= speed * FRICTION * dt // friction/drag
  speed = Math.max(-MAX_SPEED / 2, Math.min(MAX_SPEED, speed))
  if (Math.abs(speed) < 0.001) speed = 0

  // steering scales with speed so a parked car can't spin
  const speedFactor = Math.min(1, Math.abs(speed) / 10)
  const heading = car.heading + input.steer * TURN_RATE * speedFactor * Math.sign(speed || 1) * dt

  const nx = car.x + Math.cos(heading) * speed * dt
  const nz = car.z + Math.sin(heading) * speed * dt

  const resolved = resolveCircle(nx, nz, CAR_RADIUS, grid)
  const hitWall = resolved.x !== nx || resolved.z !== nz
  if (hitWall) speed *= 0.3 // bleed speed on impact

  return {
    x: resolved.x,
    z: resolved.z,
    y: provider.heightAt(resolved.x, resolved.z),
    heading,
    speed,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/vehicle/car.test.ts`
Expected: PASS. (If the "blocked from building" test fails, confirm `CAR_RADIUS` push-out keeps `x < 5`; the near wall is at x=5 so with radius 2 the car stops around x=3.)

- [ ] **Step 5: Create `src/vehicle/input.ts`**

```ts
import type { CarInput } from './car'

export class Keyboard {
  private keys = new Set<string>()
  private readonly onDown = (e: KeyboardEvent) => this.keys.add(e.key.toLowerCase())
  private readonly onUp = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase())

  constructor() {
    window.addEventListener('keydown', this.onDown)
    window.addEventListener('keyup', this.onUp)
  }

  read(): CarInput {
    const has = (...k: string[]) => k.some((x) => this.keys.has(x))
    const throttle = (has('w', 'arrowup') ? 1 : 0) - (has('s', 'arrowdown') ? 1 : 0)
    const steer = (has('d', 'arrowright') ? 1 : 0) - (has('a', 'arrowleft') ? 1 : 0)
    return { throttle, steer, brake: has(' ') }
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onDown)
    window.removeEventListener('keyup', this.onUp)
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/vehicle/ test/vehicle/car.test.ts
git commit -m "feat(vehicle): arcade car step with collision + terrain follow, keyboard input"
```

---

### Task 14: Scene, follow camera, loop

**Files:**
- Create: `src/app/scene.ts`, `src/app/loop.ts`
- Test: none (visual)

**Interfaces:**
- Consumes: `CarState` (Task 13).
- Produces:
  - `interface Stage { scene: THREE.Scene; camera: THREE.PerspectiveCamera; renderer: THREE.WebGLRenderer; carMesh: THREE.Object3D }`
  - `function createStage(mount: HTMLElement): Stage`
  - `function syncCamera(stage: Stage, car: CarState): void`
  - `function startLoop(update: (dt: number) => void): () => void` (returns a stop fn)

- [ ] **Step 1: Create `src/app/scene.ts`**

```ts
import * as THREE from 'three'
import type { CarState } from '../vehicle/car'

export interface Stage {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  carMesh: THREE.Object3D
}

export function createStage(mount: HTMLElement): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  mount.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x9fc4e8)
  scene.fog = new THREE.Fog(0x9fc4e8, 300, 900)

  scene.add(new THREE.AmbientLight(0xffffff, 0.7))
  const sun = new THREE.DirectionalLight(0xffffff, 1.1)
  sun.position.set(100, 200, 80)
  scene.add(sun)

  const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.5, 2000)

  const carMesh = new THREE.Mesh(
    new THREE.BoxGeometry(4, 1.6, 2),
    new THREE.MeshStandardMaterial({ color: 0xe63946, flatShading: true }),
  )
  scene.add(carMesh)

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })

  return { scene, camera, renderer, carMesh }
}

const camPos = new THREE.Vector3()
const camTarget = new THREE.Vector3()

export function syncCamera(stage: Stage, car: CarState): void {
  stage.carMesh.position.set(car.x, car.y + 0.8, car.z)
  stage.carMesh.rotation.y = -car.heading // box faces +x at heading 0

  const back = 14, up = 7
  camPos.set(car.x - Math.cos(car.heading) * back, car.y + up, car.z - Math.sin(car.heading) * back)
  stage.camera.position.lerp(camPos, 0.12)
  camTarget.set(car.x, car.y + 1.5, car.z)
  stage.camera.lookAt(camTarget)
}
```

- [ ] **Step 2: Create `src/app/loop.ts`**

```ts
export function startLoop(update: (dt: number) => void): () => void {
  let last = performance.now()
  let running = true
  const frame = (now: number) => {
    if (!running) return
    const dt = Math.min(0.05, (now - last) / 1000) // clamp to avoid huge steps
    last = now
    update(dt)
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
  return () => {
    running = false
  }
}
```

- [ ] **Step 3: Verify compile**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/scene.ts src/app/loop.ts
git commit -m "feat(app): stage setup, follow camera, animation loop"
```

---

### Task 15: UI overlay + full wiring

**Files:**
- Create: `src/ui/cityInput.ts`, `src/ui/loading.ts`
- Rewrite: `src/app/main.ts` (replace the visual harness with the real pipeline)
- Test: none (end-to-end manual)

**Interfaces:**
- Consumes: everything above.
- Produces: the finished app.
  - `function createCityInput(root: HTMLElement, onSubmit: (query: string) => void): void`
  - `function createLoading(root: HTMLElement): { show(msg: string): void; error(msg: string): void; hide(): void }`

- [ ] **Step 1: Create `src/ui/loading.ts`**

```ts
export function createLoading(root: HTMLElement): { show(msg: string): void; error(msg: string): void; hide(): void } {
  const box = document.createElement('div')
  box.style.cssText =
    'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
    'background:rgba(11,14,19,.85);color:#fff;padding:16px 22px;border-radius:10px;' +
    'font-size:15px;pointer-events:none;display:none;max-width:80vw;text-align:center'
  root.appendChild(box)
  return {
    show(msg) { box.style.display = 'block'; box.style.color = '#fff'; box.textContent = msg },
    error(msg) { box.style.display = 'block'; box.style.color = '#ff8080'; box.textContent = msg },
    hide() { box.style.display = 'none' },
  }
}
```

- [ ] **Step 2: Create `src/ui/cityInput.ts`**

```ts
export function createCityInput(root: HTMLElement, onSubmit: (query: string) => void): void {
  const bar = document.createElement('div')
  bar.style.cssText =
    'position:absolute;top:16px;left:50%;transform:translateX(-50%);' +
    'display:flex;gap:8px;pointer-events:auto;background:rgba(11,14,19,.8);' +
    'padding:8px;border-radius:10px'

  const input = document.createElement('input')
  input.placeholder = 'Город или "lat,lon"'
  input.value = 'Тбилиси'
  input.style.cssText = 'padding:8px 10px;border:0;border-radius:6px;font-size:14px;width:220px'

  const btn = document.createElement('button')
  btn.textContent = 'Поехали'
  btn.style.cssText = 'padding:8px 14px;border:0;border-radius:6px;background:#e63946;color:#fff;font-size:14px;cursor:pointer'

  const go = () => { if (input.value.trim()) onSubmit(input.value.trim()) }
  btn.addEventListener('click', go)
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go() })

  bar.append(input, btn)
  root.appendChild(bar)
}
```

- [ ] **Step 3: Rewrite `src/app/main.ts` with the real pipeline**

```ts
import { createStage, syncCamera, type Stage } from './scene'
import { startLoop } from './loop'
import { createCityInput } from '../ui/cityInput'
import { createLoading } from '../ui/loading'
import { geocode } from '../geo/geocode'
import { bboxAround, fetchOsm } from '../geo/overpass'
import { bboxKey, cacheGet, cachePut } from '../geo/cache'
import { parseOsm } from '../geo/parse'
import { Projector } from '../geo/project'
import { loadTerrarium } from '../terrain/terrarium'
import { FlatProvider } from '../terrain/flat'
import type { ElevationProvider } from '../terrain/provider'
import { buildGround } from '../world/ground'
import { buildBuildings } from '../world/buildings'
import { buildRoads } from '../world/roads'
import { SpatialGrid } from '../physics/grid'
import { createCar, stepCar, type CarState } from '../vehicle/car'
import { Keyboard } from '../vehicle/input'

const RADIUS = 1000

const app = document.getElementById('app')!
const ui = document.getElementById('ui')!
const stage: Stage = createStage(app)
const loading = createLoading(ui)
const keyboard = new Keyboard()

let worldGroup: import('three').Object3D[] = []
let car: CarState | null = null
let grid = new SpatialGrid([], 25)
let provider: ElevationProvider = new FlatProvider()
let stopLoop: (() => void) | null = null

async function loadCity(query: string): Promise<void> {
  try {
    loading.show('Ищу город…')
    const center = await geocode(query)
    const projector = new Projector(center)
    const bbox = bboxAround(center, RADIUS)

    loading.show('Загружаю карту OSM…')
    const key = bboxKey(bbox)
    let osm = await cacheGet(key)
    if (!osm) {
      osm = await fetchOsm(bbox)
      await cachePut(key, osm)
    }
    const world = parseOsm(osm, projector)

    loading.show('Загружаю рельеф…')
    try {
      provider = await loadTerrarium(center, bbox, projector)
    } catch {
      provider = new FlatProvider() // graceful fallback
    }

    // clear previous world
    for (const obj of worldGroup) stage.scene.remove(obj)
    worldGroup = []

    const ground = buildGround(provider, RADIUS, 160)
    const { mesh: buildingsMesh, footprints } = buildBuildings(world.buildings, provider)
    const roadsMesh = buildRoads(world.roads, provider)
    for (const obj of [ground, buildingsMesh, roadsMesh]) {
      stage.scene.add(obj)
      worldGroup.push(obj)
    }

    grid = new SpatialGrid(footprints, 25)
    car = createCar(0, 0)
    car.y = provider.heightAt(0, 0)

    loading.hide()

    if (!stopLoop) {
      stopLoop = startLoop((dt) => {
        if (!car) return
        car = stepCar(car, keyboard.read(), dt, grid, provider)
        syncCamera(stage, car)
        stage.renderer.render(stage.scene, stage.camera)
      })
    }
  } catch (e) {
    loading.error(e instanceof Error ? e.message : 'Не удалось загрузить город')
  }
}

createCityInput(ui, (q) => void loadCity(q))
void loadCity('Тбилиси')
```

- [ ] **Step 4: Full manual verification**

Run: `npm run dev`
Expected sequence:
1. Loading overlay cycles «Ищу город…» → «Загружаю карту OSM…» → «Загружаю рельеф…» then hides.
2. A low-poly city appears: green terrain (with elevation), grey roads, box buildings.
3. WASD/arrows drive the red car; camera follows from behind.
4. Driving into a building stops/slides the car — you cannot pass through it.
5. Type another city (e.g. `Amsterdam` or `41.89,12.49`) and press «Поехали» — the world reloads.
6. Second load of the same city is instant (IndexedDB cache).

Also run: `npm test` — expected: all unit tests pass. And `npx tsc --noEmit` — no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/ui/ src/app/main.ts
git commit -m "feat(app): city input, loading UI, and full geo->terrain->world->drive pipeline"
```

---

## Self-Review

**1. Spec coverage:**
- Vite+TS+Three.js, static, no backend → Task 1. ✓
- Free-roam driving, no opponents/timers → Tasks 13–15. ✓
- Any city by input (name or lat,lon) → Task 5 + Task 15. ✓
- ~1 km bbox around center → `RADIUS=1000`, Task 4 + Task 15. ✓
- Nominatim + Overpass + IndexedDB cache → Tasks 4, 5, 6, 15. ✓
- Building height from `height`/`building:levels`/default → Task 3. ✓
- Terrain elevation via Terrarium + `ElevationProvider` + flat fallback → Tasks 7, 15. ✓
- Low-poly flat-color style → Tasks 8–10, 14 (all `flatShading`). ✓
- Arcade physics, complexify later → Task 13. ✓
- Collisions: no driving through buildings, slide along walls → Tasks 11–13. ✓
- Car & buildings & roads follow terrain → Tasks 8–10, 13. ✓
- Error handling (city not found, Overpass fail, terrain fallback, bad geometry, offline cache) → Tasks 3, 5, 6, 15. ✓
- Tests on projection, parse, overpass, terrarium decode, grid, collide, car, road width → Tasks 2–7, 10–13. ✓
- Out of scope (wireframe, parks/water, realistic physics, minimap, day/night, audio, racing) → not implemented, matches spec §6/§9. ✓

**2. Placeholder scan:** No TBD/TODO. The one prose note (Task 12 inside-branch correction) shows the exact corrected code block to use — no ambiguity left.

**3. Type consistency:** `Vec2 {x,z}`, `LatLon {lat,lon}`, `WorldData {roads,buildings}`, `ElevationProvider.heightAt(x,z)`, `SpatialGrid.near`, `resolveCircle`, `CarState`, `CarInput`, `stepCar` signatures are used identically across producing and consuming tasks. `OverpassResponse` defined in Task 3 and imported by Tasks 4, 6. `BBox` defined in Task 4 and imported by Tasks 6, 7. Consistent.
