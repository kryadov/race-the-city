# Races with rivals — design

**Goal:** three AI rivals race the player around the time-trial gate course, and the HUD says
what position you're in.

## Why this shape

The pieces are already here. `timeTrial.ts` lays out six gates on road vertices and knows which
one is next. `autopilot.ts` drives a `CarState` through `stepCar` with the same throttle, steer
and brake a player presses — so a rival that reuses it is a car in the same world under the same
physics, not a marker sliding along a spline.

The one thing missing is that autopilot **wanders**: `nextNode` picks whichever link carries
straightest on, with a random nudge. A racer has to arrive somewhere specific. So the new part is
a route — and only that.

## Components

### `src/world/route.ts` (new)

```ts
export function findRoute(graph: RoadGraph, start: number, goal: number, maxVisits?: number): number[]
```

A* over the road graph, straight-line distance as the heuristic, returning node indices from
`start` to `goal` inclusive, or `[]` when the goal is unreachable (the graph is not one connected
piece — a river or a motorway splits it, and a rival on the wrong side must not hang the frame
hunting for a way across). `maxVisits` caps the search; central St Petersburg is ~40k nodes and
the cap is what keeps a doomed search bounded.

Pure, no Three.js — testable directly.

### `src/app/rivals.ts` (new)

```ts
export interface Rivals {
  setEnabled(on: boolean): void
  enabled(): boolean
  /** Lay out fresh rivals at the start line and route them at the first gate. */
  reset(roads: Road[], provider: ElevationProvider, car: CarState, course: Vec2[]): void
  /** @returns the player's position, 1-based, and the field size. */
  update(dt: number, car: CarState, playerTaken: number, course: Vec2[]): RaceState
  dispose(): void
}
export interface RaceState { place: number; of: number }
```

Each rival owns:
- a `CarState`, started a few metres to the side of the player,
- a `VehicleSpec` and a mesh from `buildVehicleMesh` — different vehicle each, so you can tell
  them apart at a glance,
- the gate it is going for, and its A* route to it,
- a speed cap, varied per rival, which is the difficulty knob: a rival that drives the player's
  car perfectly would simply win.

Per frame each rival steers at the next node of its route (the existing arrive-and-advance walk),
feeds `stepCar`, and when it reaches its gate re-routes to the next one. Re-routing is one A* per
rival per gate — six gates times four cars over a lap, not per frame.

`place` is the field sorted by gates taken, then by distance to the next gate.

### Wiring

Racing is the time trial with company, so it rides on the same gates rather than inventing a
second course: a `race` setting under the trial toggle, `rivals.reset` alongside `trial.reset`,
and `trialHud` gains a place line.

## Deliberately not doing

- **Rivals as solid obstacles.** The player already drives through traffic — `stepCar` collides
  against the static building grid only. A rival you can't touch is consistent with the game
  that's there; making rivals solid means making traffic solid, which is its own change.
- **Difficulty setting.** One field, tuned to be beatable. Add a knob when there's evidence it's
  needed.
- **Rivals in the minimap.** The gate arrow is the thing you steer by.
