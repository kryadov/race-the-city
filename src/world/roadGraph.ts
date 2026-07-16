import type { Road, Vec2 } from '../geo/types'

/** A node is a road vertex; edges are the segments between them. */
export interface GraphNode {
  x: number
  z: number
  /** Indices of the nodes this one connects to. */
  links: number[]
}

export interface RoadGraph {
  nodes: GraphNode[]
  /** The node nearest a point, or -1 if the graph is empty. */
  nearest(x: number, z: number): number
}

/** Roads a car has no business on. */
const UNDRIVABLE = new Set(['path'])

/**
 * Weld road polylines into a connected graph.
 *
 * OSM roads are independent lists of points that happen to share coordinates at
 * junctions, so nothing in the data says two roads meet. Vertices are welded on
 * a fine grid instead: crossing ways genuinely share a node in OSM, and its
 * coordinates survive projection identically, so a grid cell reunites them
 * without fusing two roads that merely pass close by.
 */
export function buildRoadGraph(roads: Road[], cell = 0.5): RoadGraph {
  const nodes: GraphNode[] = []
  const byKey = new Map<string, number>()

  const idOf = (p: Vec2): number => {
    const key = `${Math.round(p.x / cell)},${Math.round(p.z / cell)}`
    const hit = byKey.get(key)
    if (hit !== undefined) return hit
    const id = nodes.length
    nodes.push({ x: p.x, z: p.z, links: [] })
    byKey.set(key, id)
    return id
  }

  const link = (a: number, b: number): void => {
    if (a === b) return
    if (!nodes[a].links.includes(b)) nodes[a].links.push(b)
    if (!nodes[b].links.includes(a)) nodes[b].links.push(a)
  }

  for (const road of roads) {
    if (UNDRIVABLE.has(road.kind)) continue
    // Tunnels aren't modelled — they're under the buildings, which are solid.
    // Routing traffic through one drives it into a wall.
    if (road.tunnel) continue
    let prev = -1
    for (const p of road.points) {
      const id = idOf(p)
      if (prev !== -1) link(prev, id)
      prev = id
    }
  }

  return {
    nodes,
    nearest(x, z) {
      let best = -1
      let bestD = Infinity
      for (let i = 0; i < nodes.length; i++) {
        const d = (nodes[i].x - x) ** 2 + (nodes[i].z - z) ** 2
        if (d < bestD) {
          bestD = d
          best = i
        }
      }
      return best
    },
  }
}

/** How much a turn is disliked: 1 = straight on, 0 = a U-turn. */
function straightness(from: GraphNode, at: GraphNode, to: GraphNode): number {
  const ax = at.x - from.x
  const az = at.z - from.z
  const bx = to.x - at.x
  const bz = to.z - at.z
  const la = Math.hypot(ax, az)
  const lb = Math.hypot(bx, bz)
  if (la === 0 || lb === 0) return 0
  return ((ax * bx + az * bz) / (la * lb) + 1) / 2
}

/**
 * Pick the next node to drive to from `at`, having come from `from`.
 *
 * Prefers carrying straight on, which is what keeps a wanderer touring the city
 * instead of rattling back and forth across one junction. Doubling back is a
 * last resort — but it is allowed, or a dead end would strand the car.
 */
export function nextNode(graph: RoadGraph, from: number, at: number, rand: () => number): number {
  const node = graph.nodes[at]
  if (!node || node.links.length === 0) return at
  const options = node.links.filter((n) => n !== from)
  if (options.length === 0) return from // dead end: turn around

  let bestScore = -Infinity
  let best = options[0]
  for (const opt of options) {
    const straight = from >= 0 ? straightness(graph.nodes[from], node, graph.nodes[opt]) : 0.5
    const score = straight + rand() * 0.45 // a nudge, so it doesn't drive the same loop forever
    if (score > bestScore) {
      bestScore = score
      best = opt
    }
  }
  return best
}

/**
 * Is there anywhere to go from this node, or is it a pocket?
 *
 * A driveway, a service loop behind a shop, a stub of road left hanging where
 * the map was cut: park a car on one and it drives ten metres, turns round,
 * drives back, and turns round again, for good. Spotting that after the fact —
 * two U-turns and recycle it — still shows you the dance first. This asks
 * before: how far from here can you actually get, walking the road network?
 *
 * @param need metres of room required
 * @param budget how many nodes to look at before giving up and saying yes; a
 *   junction in a dense city is a cluster of vertices, so this is generous
 */
export function roomToDrive(graph: RoadGraph, at: number, need = 120, budget = 120): boolean {
  const start = graph.nodes[at]
  if (!start || start.links.length === 0) return false
  const seen = new Set<number>([at])
  const queue = [at]
  for (let head = 0; head < queue.length && seen.size < budget; head++) {
    const node = graph.nodes[queue[head]]
    if (Math.hypot(node.x - start.x, node.z - start.z) >= need) return true
    for (const next of node.links) {
      if (seen.has(next) || !graph.nodes[next]) continue
      seen.add(next)
      queue.push(next)
    }
  }
  return false
}
