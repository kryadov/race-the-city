# Wave 0 — Cleanup Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up stale/duplicate/inconsistent TODO.md items, expand the random cities list, bump version, update CHANGELOG.

**Architecture:** Documentation-only release. The only code touched is `src/app/cities.ts` (a data list, no logic). All cleanup actions are verified against source code — see the spec at `docs/superpowers/specs/2026-08-01-todo-backlog-strategy-design.md`.

**Tech Stack:** TypeScript (strict), Vitest, Vite. No new dependencies.

## Global Constraints

- TypeScript strict mode + `noUnusedLocals`/`noUnusedParameters`.
- `npm test` and `npx tsc --noEmit` must both pass before committing.
- `npm run build` must succeed and leave no stray files.
- Version bump is patch: `0.148.3` → `0.148.4`.
- CHANGELOG entry goes at the TOP (newest first), with a 👀 "what to look for" line.
- FEATURES.md updated if a player-visible feature changed (none here — cleanup only).

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `TODO.md` | Modify | Mark stale items, consolidate duplicates, rewrite inconsistencies |
| `src/app/cities.ts` | Modify | Add cities to under-represented regions for balance |
| `test/app/cities.test.ts` | Run only | Existing tests verify no-dup, coverage, region balance |
| `CHANGELOG.md` | Modify | Add v0.148.4 entry at top |
| `package.json` | Modify | Bump version 0.148.3 → 0.148.4 |

---

### Task 1: Mark stale TODO items as done

**Files:**
- Modify: `TODO.md` (lines :286, :346, :141, :455, :559, :289, :533)

**Interfaces:**
- Consumes: spec Section 1a/1b at `docs/superpowers/specs/2026-08-01-todo-backlog-strategy-design.md`
- Produces: TODO.md with stale items marked `[x]` or `[~]`

- [ ] **Step 1: Mark Forests / woodland (`:286`) as `[x]`**

Find the line:
```
- [ ] **Forests / woodland** — support and render **large wooded areas** (OSM `landuse=forest`,
```
Change `- [ ]` to `- [x]` and append after the item's closing line:
```
      — ✅ DONE: `greenery.ts` `collectForestSpots` + `MAX_FOREST_TREES` + `buildGreenery(forests)`; `parse.ts:243`; `main.ts:666`.
```

- [ ] **Step 2: Mark Underwater bubbles (`:346`) as `[x]`**

Find the line:
```
- [ ] **Underwater bubbles** — if the car sinks so the water is **above the roof**, emit **bubbles
```
Change `- [ ]` to `- [x]` and append:
```
      — ✅ DONE: `src/fx/bubbles.ts` (whole module); `main.ts:293` creates, `:1165` updates.
```

- [ ] **Step 3: Mark Shopfronts (`:141`) as `[x]`**

Find the line:
```
- [ ] **Shopfronts / storefront windows** — render shop and service-business frontages on ground
```
Change `- [ ]` to `- [x]` and append:
```
      — ✅ DONE: `buildings.ts` `buildShopfronts` + `shopfrontTexture`; `facade.ts:49-52` `shopfront:true` for retail/office/civic.
```

- [ ] **Step 4: Mark World edge big feature (`:455`) as `[x]`**

Find the line:
```
- [ ] **1. Keep the car on the map (world edge)** — DESIGN LOCKED. Circle boundary
```
Change `- [ ]` to `- [x]` and append after the item:
```
      — ✅ DONE: `bounds.ts` (square `rectBounds` EDGE_SOFT 965, EDGE_HARD 990) + `mistWall.ts`. Design evolved circle→square (v0.92.0 bug). See AGENTS.md "The world has an edge".
```

- [ ] **Step 5: Mark Keep car on the map (`:559`) as `[x]` (duplicate of :455)**

Find the line:
```
- [ ] **Keep the car on the map** — nothing stops you driving off the ground mesh (RADIUS
```
Change `- [ ]` to `- [x]` and append:
```
      — ✅ DONE (duplicate of the world-edge item above): `bounds.ts` + `mistWall.ts`.
```

- [ ] **Step 6: Mark Railway stations (`:289`) as `[~]` (partial)**

Find the line:
```
- [ ] **Railway stations with platforms + boarding** — draw rail stops as a **platform** (OSM
```
Change `- [ ]` to `[~]` and append:
```
      — PARTLY DONE: `trains.ts:482` `buildPlatform` (slab, yellow edge, canopy, lamps, figures) + `board()` + dwell at `:801-824`. STILL OPEN: Overpass queries only railway lines (`overpass.ts:98`), NOT `railway=station|platform|halt` — platforms are procedural, not at real OSM station positions. Finish = add station tags to Overpass + place by real data.
```

- [ ] **Step 7: Mark Birds still wrong (`:533`) as `[x]`**

Find the line:
```
- [ ] **Birds are still wrong, and the model is worse than the motion** (reported after
```
Change `- [ ]` to `- [x]` and append:
```
      — ✅ DONE: model fix (v0.93.0 `bodyGeometry` octahedron body); perch fix (v0.110.60 crown height + canopy clamp); full state machine `perched → takeoff → cruise → landing → settle` in `birds.ts:326` with transitions at `:685-721`.
```

- [ ] **Step 8: Commit**

```bash
git add TODO.md
git commit -m "docs: mark stale TODO items as done (forests, bubbles, shopfronts, world edge, birds)"
```

---

### Task 2: Consolidate duplicate "bigger map" items

**Files:**
- Modify: `TODO.md` (lines :106, :169, :616)

**Interfaces:**
- Consumes: spec Section 1c
- Produces: One canonical bigger-map item at :169; :106 and :616 reduced to cross-references

- [ ] **Step 1: Make :169 the canonical bigger-map item**

Find the item at `:169`:
```
- [ ] **Bigger map (×2 diameter) without frame-rate loss, adaptive** — raise `RADIUS` (1000 → 2000)
```
Prepend `[CANONICAL]` to the bold title:
```
- [ ] **Bigger map (×2 diameter) without frame-rate loss, adaptive** [CANONICAL — merges :106, :616] — raise `RADIUS` (1000 → 2000)
```

- [ ] **Step 2: Replace :106 with a cross-reference**

Find the item at `:106`:
```
- [ ] **Bigger map ×2, adaptive** — see note below. Brainstorm.
```
Replace with:
```
- [ ] **Bigger map ×2, adaptive** — see the canonical item at the "Bigger map (×2 diameter)" entry below (merges :106, :616).
```

- [ ] **Step 3: Replace :616 with a cross-reference**

Find the item at `:616`:
```
- [ ] **Map radius ×1.5** (1000m → 1500m) if it does not cost performance — measure first:
```
Replace with:
```
- [ ] **Map radius ×1.5** — see the canonical "Bigger map (×2 diameter)" entry below (merges :106, :616).
```

- [ ] **Step 4: Commit**

```bash
git add TODO.md
git commit -m "docs: consolidate 3 duplicate bigger-map TODO items into 1 canonical"
```

---

### Task 3: Rewrite inconsistent TODO items

**Files:**
- Modify: `TODO.md` (lines :184, :657, :292)

**Interfaces:**
- Consumes: spec Section 1d
- Produces: :184 narrowed to one-way barrier; :657 narrowed to bot-vs-bot; :292 annotated

- [ ] **Step 1: Rewrite :184 — waterfront railings → one-way barrier only**

Find the item at `:184`:
```
- [ ] **Waterfront railings + curb** — where a lake/river has an **embankment/quay (набережная)**,
      fence it with a **railing** and a **curb the car can't cross into the water**; but if the car
      DID get in, it can drive back out (one-way soft barrier). Ties into the pedestrian water-avoid
      work and boats.
```
Replace with:
```
- [ ] **Waterfront one-way barrier** — the railing mesh and collision are done (v0.144.2); STILL
      OPEN: a one-way soft barrier so if the car DID get into the water, it can drive back out (no
      hard wall trapping it underwater). Ties into boats and the pedestrian water-avoid work.
```

- [ ] **Step 2: Rewrite :657 — rivals/traffic → bot-vs-bot + bot-vs-parked only**

Find the item at `:657`:
```
- [ ] Rivals and traffic as solid obstacles (today you drive through both)
```
Replace with:
```
- [ ] **Bot-vs-bot and bot-vs-parked-car separation** — car-to-car separation is done (v0.110.14),
      but bots still drive through each other and through parked cars. Add circle-vs-circle separation
      in `traffic.ts` (spatial bucket, O(cars)) and bot-vs-parked gap holding (extend the existing
      PARKED_GAP). Weak spots per AGENTS.md.
```

- [ ] **Step 3: Annotate :292 — bot buses with version note**

Find the item at `:292`:
```
- [x] **Bot buses that stop + board** — add **AI buses** that run routes and **stop at bus stops**
      (`highway=bus_stop`, already used for street furniture), where **people get on and off**. Bus
      as a traffic agent with dwell-at-stop behaviour + pedestrian board/alight.
```
Append:
```
      — boarding/alighting in `buses.ts:128-129,453-461`.
```

- [ ] **Step 4: Commit**

```bash
git add TODO.md
git commit -m "docs: rewrite inconsistent TODO items (waterfront one-way, bot separation, buses)"
```

---

### Task 4: Expand the random cities list

**Files:**
- Modify: `src/app/cities.ts` (CITY_REGIONS array)
- Test: `test/app/cities.test.ts` (run existing — verifies no-dup, coverage, balance)

**Interfaces:**
- Consumes: existing `CITY_REGIONS` structure (10 regions, ~85 cities)
- Produces: expanded `CITY_REGIONS` with more cities in under-represented regions

The existing test `cities.test.ts` enforces:
- No duplicate city names
- No empty regions
- Every region gets a fair turn (0.6×–1.6× of expected share over 4000 draws)
- Europe vs Asia not lopsided (<6% difference)

So new cities must be added **roughly evenly across regions** to keep the balance test green.

- [ ] **Step 1: Write a failing test that asserts the new cities are present**

Add to `test/app/cities.test.ts`, inside the `describe('the city list', ...)` block, after the existing `'covers the world, not just Europe'` test:

```typescript
  it('has at least 100 cities across the regions', () => {
    expect(RANDOM_CITIES.length).toBeGreaterThanOrEqual(100)
  })

  it('includes the newly added cities', () => {
    for (const must of [
      'Valencia, Spain',
      'Hamburg, Germany',
      'Nizhny Novgorod, Russia',
      'Fukuoka, Japan',
      'Kolkata, India',
      'Riyadh, Saudi Arabia',
      'Addis Ababa, Ethiopia',
      'Denver, USA',
      'Quito, Ecuador',
      'Perth, Australia',
    ]) {
      expect(RANDOM_CITIES, must).toContain(must)
    }
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/app/cities.test.ts`
Expected: FAIL — `RANDOM_CITIES.length` is ~85 (< 100) and the new cities are not in the list.

- [ ] **Step 3: Add the new cities to `src/app/cities.ts`**

Add the following cities to each region (matching the region's theme). Insert alphabetically within each region array:

**Western & Southern Europe** (currently 10 → add 2):
- `'Valencia, Spain'` after `'Barcelona, Spain'`
- `'Naples, Italy'` after `'Florence, Italy'`

**Central, Northern & Eastern Europe** (currently 9 → add 3):
- `'Hamburg, Germany'` before `'Copenhagen, Denmark'`
- `'Berlin, Germany'` before `'Budapest, Hungary'`
- `'Stockholm, Sweden'` after `'Reykjavik, Iceland'`

**Russia & the Caucasus** (currently 10 → add 2):
- `'Nizhny Novgorod, Russia'` after `'Moscow, Russia'`
- `'Samara, Russia'` after `'Kazan, Russia'`

**East Asia** (currently 11 → add 2):
- `'Fukuoka, Japan'` after `'Chengdu, China'`
- `'Guangzhou, China'` after `'Chengdu, China'`

**South & Southeast Asia** (currently 11 → add 2):
- `'Kolkata, India'` after `'Delhi, India'`
- `'Manila, Philippines'` after `'Jakarta, Indonesia'`

**Middle East & Central Asia** (currently 7 → add 3):
- `'Riyadh, Saudi Arabia'` after `'Dubai, United Arab Emirates'`
- `'Muscat, Oman'` after `'Amman, Jordan'`
- `'Bishkek, Kyrgyzstan'` after `'Almaty, Kazakhstan'`

**Africa** (currently 7 → add 3):
- `'Addis Ababa, Ethiopia'` after `'Accra, Ghana'`
- `'Dakar, Senegal'` before `'Accra, Ghana'`
- `'Kigali, Rwanda'` after `'Nairobi, Kenya'`

**North America** (currently 8 → add 2):
- `'Denver, USA'` after `'Chicago, USA'`
- `'Austin, USA'` after `'Boston, USA'`

**Latin America** (currently 8 → add 2):
- `'Quito, Ecuador'` after `'Bogota, Colombia'`
- `'Cartagena, Colombia'` after `'Bogota, Colombia'`

**Oceania** (currently 4 → add 2):
- `'Perth, Australia'` after `'Melbourne, Australia'`
- `'Brisbane, Australia'` after `'Melbourne, Australia'`

Total: 85 → 108 cities (23 added). Each region grows by 2-3, preserving the balance test.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/app/cities.test.ts`
Expected: PASS — 108 cities ≥ 100, all new cities present, no duplicates, regions balanced.

- [ ] **Step 5: Run type-check and full test suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all green (existing tests unaffected — only data list changed).

- [ ] **Step 6: Commit**

```bash
git add src/app/cities.ts test/app/cities.test.ts
git commit -m "feat: expand random cities list from 85 to 108 (v0.148.4)"
```

---

### Task 5: Bump version and update CHANGELOG

**Files:**
- Modify: `package.json` (version field)
- Modify: `CHANGELOG.md` (new entry at top)

**Interfaces:**
- Consumes: all changes from Tasks 1-4
- Produces: version `0.148.4`, CHANGELOG entry

- [ ] **Step 1: Bump version in `package.json`**

Change `"version": "0.148.3"` to `"version": "0.148.4"`.

- [ ] **Step 2: Add CHANGELOG entry**

Insert at the TOP of `CHANGELOG.md` (after the header block, before `## v0.148.3`):

```markdown
## v0.148.4 — TODO cleanup + more cities
- **TODO.md cleaned up:** 6 stale items marked done (forests, underwater bubbles, shopfronts,
  world edge, railway-station boarding, birds) — all verified against source code. 3 duplicate
  "bigger map" entries consolidated to 1. 3 inconsistent items (waterfront, bot separation, buses)
  rewritten to reflect what's actually left.
- **23 more random cities** (85 → 108): Valencia, Naples, Hamburg, Berlin, Stockholm, Nizhny
  Novgorod, Samara, Fukuoka, Guangzhou, Kolkata, Manila, Riyadh, Muscat, Bishkek, Addis Ababa,
  Dakar, Kigali, Denver, Austin, Quito, Cartagena, Perth, Brisbane. Each region grew by 2-3 so
  the draw stays balanced.
- 👀 No visible change to the game itself. The 🎲 random-city button has a wider pool to draw from.

## v0.148.3 — the invisible wall on the quay is gone
```
(Keep the existing v0.148.3 section intact below the new entry.)

- [ ] **Step 3: Verify build succeeds**

Run: `npm run build`
Expected: build succeeds, no stray files.

Run: `git status --short`
Expected: only `package.json` and `CHANGELOG.md` modified (no stray dist/ files).

- [ ] **Step 4: Commit**

```bash
git add package.json CHANGELOG.md
git commit -m "release: v0.148.4 — TODO cleanup + more cities"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds, clean `git status --short`.

- [ ] **Step 4: Git log sanity**

Run: `git log --oneline -6`
Expected: 4-5 commits on this branch, all with clear messages.
