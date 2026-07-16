import type { RoadGraph } from './roadGraph'

/**
 * How many nodes a search may settle before it gives up.
 *
 * The road graph is not one connected piece — a river, a motorway or a gap in
 * the OSM data splits it into islands, and a rival stranded on the wrong one
 * would otherwise search every node in the city, every time, on the frame it
 * asks for a route.
 */
const MAX_VISITS = 4000

/** Straight-line distance, in metres — the A* heuristic, and never an overestimate. */
function dist(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

/**
 * The shortest way from one node to another, as node indices, `start` and `goal`
 * included.
 *
 * Empty when there is no way there, or when the search hit `maxVisits` first —
 * a caller gets "no route" either way and must have something to do about it.
 */
export function findRoute(
  graph: RoadGraph,
  start: number,
  goal: number,
  maxVisits = MAX_VISITS,
): number[] {
  const nodes = graph.nodes
  if (!nodes[start] || !nodes[goal]) return []
  if (start === goal) return [start]

  const best = new Map<number, number>([[start, 0]])
  const cameFrom = new Map<number, number>()
  const done = new Set<number>()
  // A plain list scanned for the cheapest entry: a heap is faster in principle,
  // but the frontier here is small and this runs a few times a lap, not a frame.
  const open: number[] = [start]
  const priority = new Map<number, number>([[start, dist(nodes[start], nodes[goal])]])

  while (open.length && done.size < maxVisits) {
    let pick = 0
    for (let i = 1; i < open.length; i++) {
      if ((priority.get(open[i]) ?? Infinity) < (priority.get(open[pick]) ?? Infinity)) pick = i
    }
    const at = open.splice(pick, 1)[0]
    if (at === goal) {
      const path = [at]
      for (let n = at; cameFrom.has(n); ) {
        n = cameFrom.get(n) as number
        path.push(n)
      }
      return path.reverse()
    }
    done.add(at)

    const soFar = best.get(at) as number
    for (const next of nodes[at].links) {
      if (done.has(next) || !nodes[next]) continue
      const cost = soFar + dist(nodes[at], nodes[next])
      if (cost >= (best.get(next) ?? Infinity)) continue
      best.set(next, cost)
      cameFrom.set(next, at)
      priority.set(next, cost + dist(nodes[next], nodes[goal]))
      if (!open.includes(next)) open.push(next)
    }
  }
  return []
}
