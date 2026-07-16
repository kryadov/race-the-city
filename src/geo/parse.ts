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

export function isWater(tags: Record<string, string>): boolean {
  return tags.natural === 'water' || tags.waterway === 'riverbank' || tags.landuse === 'reservoir'
}

const RAIL_KINDS = new Set(['rail', 'light_rail', 'tram', 'narrow_gauge'])
export function isRailway(tags: Record<string, string>): boolean {
  return RAIL_KINDS.has(tags.railway)
}

const GREEN_LANDUSE = new Set(['grass', 'forest', 'meadow', 'recreation_ground', 'village_green'])
export function isGreen(tags: Record<string, string>): boolean {
  return (
    tags.leisure === 'park' ||
    tags.leisure === 'garden' ||
    tags.natural === 'wood' ||
    tags.natural === 'scrub' ||
    GREEN_LANDUSE.has(tags.landuse)
  )
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
  const trees: Vec2[] = []
  for (const el of json.elements) {
    if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined) {
      const local = projector.toLocal({ lat: el.lat, lon: el.lon })
      nodes.set(el.id, local)
      if (el.tags?.natural === 'tree') trees.push(local)
    }
  }

  const roads: Road[] = []
  const buildings: Building[] = []
  const water: Vec2[][] = []
  const green: Vec2[][] = []
  const coast: Vec2[][] = []
  const railways: Vec2[][] = []

  for (const el of json.elements) {
    if (el.type !== 'way' || !el.nodes || el.nodes.length < 2) continue
    const tags = el.tags ?? {}
    const points = el.nodes.map((id) => nodes.get(id)).filter((p): p is Vec2 => !!p)
    if (points.length < 2) continue

    if (tags.natural === 'coastline') {
      coast.push(points) // linear boundary between land and sea
    } else if (isWater(tags)) {
      const ring = points.length > 2 ? points.slice(0, closedRingLength(points)) : points
      if (ring.length >= 3) water.push(ring)
    } else if (isGreen(tags)) {
      const ring = points.length > 2 ? points.slice(0, closedRingLength(points)) : points
      if (ring.length >= 3) green.push(ring)
    } else if (isRailway(tags)) {
      railways.push(points)
    } else if (tags.building) {
      const ring = points.length > 2 ? points.slice(0, closedRingLength(points)) : points
      if (ring.length >= 3) buildings.push({ footprint: ring, height: buildingHeight(tags) })
    } else if (tags.highway) {
      const road: Road = { points, kind: classifyRoad(tags.highway) }
      if (tags.name) road.name = tags.name
      if (tags.bridge && tags.bridge !== 'no') road.bridge = true
      if (tags.tunnel && tags.tunnel !== 'no') road.tunnel = true
      roads.push(road)
    }
  }

  return { roads, buildings, water, green, trees, coast, railways }
}

/** Ring length excluding the repeated closing node (OSM closed ways repeat the first node last). */
function closedRingLength(points: Vec2[]): number {
  const first = points[0]
  const last = points[points.length - 1]
  return first.x === last.x && first.z === last.z ? points.length - 1 : points.length
}
