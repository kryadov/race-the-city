import type { Projector } from './project'
import type { Building, BuildingKind, Prop, PropKind, Road, RoadKind, Vec2, WorldData } from './types'

export interface OverpassMember {
  type: 'node' | 'way' | 'relation'
  ref: number
  role?: string
}
export interface OverpassElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  nodes?: number[]
  members?: OverpassMember[]
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

/** The ornament this tagging describes, or null if it isn't one. */
export function classifyProp(tags: Record<string, string>): PropKind | null {
  if (tags.amenity === 'fountain') return 'fountain'
  if (tags.historic === 'memorial' || tags.historic === 'monument') return 'statue'
  if (tags.tourism === 'artwork') return 'statue'
  if (tags.landuse === 'flowerbed') return 'flowerbed'
  return null
}

export function isParking(tags: Record<string, string>): boolean {
  // Multi-storey and underground parking are buildings, not painted tarmac.
  return tags.amenity === 'parking' && !tags.building && tags.parking !== 'underground' && tags.parking !== 'multi-storey'
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

const HOUSE = new Set(['house', 'detached', 'semidetached_house', 'bungalow', 'terrace', 'hut', 'cabin'])
const APARTMENTS = new Set(['apartments', 'residential', 'dormitory', 'hotel'])
const RETAIL = new Set(['retail', 'supermarket', 'shop', 'kiosk', 'commercial', 'restaurant'])
const OFFICE = new Set(['office', 'government'])
const INDUSTRIAL = new Set(['industrial', 'warehouse', 'factory', 'hangar', 'garage', 'garages', 'shed', 'service'])
const CIVIC = new Set(['school', 'university', 'college', 'hospital', 'church', 'cathedral', 'mosque',
  'synagogue', 'temple', 'museum', 'train_station', 'civic', 'public', 'stadium', 'sports_hall'])

/**
 * What a building is for. `building=yes` is by far the most common tag and says
 * nothing, so fall back to the tags people do add — a shop or an office on the
 * building — and only then guess from its size.
 */
export function classifyBuilding(tags: Record<string, string>): BuildingKind {
  const b = tags.building ?? ''
  if (HOUSE.has(b)) return 'house'
  if (APARTMENTS.has(b)) return 'apartments'
  if (RETAIL.has(b)) return 'retail'
  if (OFFICE.has(b)) return 'office'
  if (INDUSTRIAL.has(b)) return 'industrial'
  if (CIVIC.has(b)) return 'civic'
  // untyped building: believe the other tags before the default
  if (tags.shop || tags.amenity === 'restaurant' || tags.amenity === 'cafe' || tags.amenity === 'bar') return 'retail'
  if (tags.office) return 'office'
  if (tags.amenity === 'school' || tags.amenity === 'hospital' || tags.amenity === 'place_of_worship') return 'civic'
  if (tags.man_made === 'works' || tags.industrial) return 'industrial'
  return 'apartments'
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
  const props: Prop[] = []
  for (const el of json.elements) {
    if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined) {
      const local = projector.toLocal({ lat: el.lat, lon: el.lon })
      nodes.set(el.id, local)
      if (el.tags?.natural === 'tree') trees.push(local)
      else {
        const kind = classifyProp(el.tags ?? {})
        if (kind) props.push({ at: local, kind })
      }
    }
  }

  const wayNodes = new Map<number, number[]>()
  for (const el of json.elements) {
    if (el.type === 'way' && el.nodes) wayNodes.set(el.id, el.nodes)
  }

  const roads: Road[] = []
  const buildings: Building[] = []
  const water: Vec2[][] = []
  const green: Vec2[][] = []
  const parking: Vec2[][] = []
  const coast: Vec2[][] = []
  const railways: Vec2[][] = []

  for (const el of json.elements) {
    if (el.type !== 'way' || !el.nodes || el.nodes.length < 2) continue
    const tags = el.tags ?? {}
    const points = el.nodes.map((id) => nodes.get(id)).filter((p): p is Vec2 => !!p)
    if (points.length < 2) continue

    const propKind = classifyProp(tags)
    if (propKind) {
      let cx = 0
      let cz = 0
      for (const p of points) {
        cx += p.x
        cz += p.z
      }
      props.push({ at: { x: cx / points.length, z: cz / points.length }, kind: propKind })
      continue
    }
    if (tags.natural === 'coastline') {
      coast.push(points) // linear boundary between land and sea
    } else if (isWater(tags)) {
      const ring = points.length > 2 ? points.slice(0, closedRingLength(points)) : points
      if (ring.length >= 3) water.push(ring)
    } else if (isParking(tags)) {
      const ring = points.length > 2 ? points.slice(0, closedRingLength(points)) : points
      if (ring.length >= 3) parking.push(ring)
    } else if (isGreen(tags)) {
      const ring = points.length > 2 ? points.slice(0, closedRingLength(points)) : points
      if (ring.length >= 3) green.push(ring)
    } else if (isRailway(tags)) {
      railways.push(points)
    } else if (tags.building) {
      const ring = points.length > 2 ? points.slice(0, closedRingLength(points)) : points
      if (ring.length >= 3) buildings.push({ footprint: ring, height: buildingHeight(tags), kind: classifyBuilding(tags) })
    } else if (tags.highway) {
      const road: Road = { points, kind: classifyRoad(tags.highway) }
      if (tags.name) road.name = tags.name
      if (tags.bridge && tags.bridge !== 'no') road.bridge = true
      if (tags.tunnel && tags.tunnel !== 'no') road.tunnel = true
      const layer = parseInt(tags.layer, 10)
      if (!Number.isNaN(layer) && layer !== 0) road.layer = layer
      roads.push(road)
    }
  }

  // Multipolygon relations: the only way big rivers (the Neva, the Moskva) are
  // mapped — they never arrive as a single closed way.
  for (const el of json.elements) {
    if (el.type !== 'relation' || !el.members) continue
    if (!isWater(el.tags ?? {})) continue
    if (el.members.length > MAX_RELATION_MEMBERS) continue // a whole-river monster
    const outers: number[][] = []
    for (const mem of el.members) {
      if (mem.type !== 'way') continue
      if (mem.role && mem.role !== 'outer') continue // inner rings are islands; skip for now
      const ns = wayNodes.get(mem.ref)
      if (ns && ns.length >= 2) outers.push(ns)
    }
    for (const ringIds of stitchRings(outers)) {
      const pts = ringIds.map((id) => nodes.get(id)).filter((p): p is Vec2 => !!p)
      if (pts.length >= 3) water.push(pts)
    }
  }

  return { roads, buildings, water, green, parking, trees, props, coast, railways }
}

/** Skip a relation with more members than this — a whole-river monster. */
export const MAX_RELATION_MEMBERS = 600

/**
 * Stitch a multipolygon's member ways into closed rings.
 *
 * A big river's outline is cut into dozens of ways that only join end to end,
 * so each has to be walked and joined before there is a polygon to fill. Joins
 * are matched on node id rather than coordinates: the ends are the same node,
 * and comparing floats would leave the ring open over rounding.
 *
 * Ways that never close are dropped — an open chain has no inside to fill.
 */
export function stitchRings(ways: number[][]): number[][] {
  const pool = ways.filter((w) => w.length >= 2).map((w) => w.slice())
  const rings: number[][] = []

  while (pool.length) {
    let ring = pool.pop() as number[]
    let joined = true
    while (joined && ring[0] !== ring[ring.length - 1]) {
      joined = false
      for (let i = 0; i < pool.length; i++) {
        const w = pool[i]
        const end = ring[ring.length - 1]
        if (w[0] === end) {
          ring = ring.concat(w.slice(1))
        } else if (w[w.length - 1] === end) {
          ring = ring.concat(w.slice(0, -1).reverse())
        } else {
          continue
        }
        pool.splice(i, 1)
        joined = true
        break
      }
    }
    // A closed ring repeats its first node last; drop the repeat.
    if (ring.length >= 4 && ring[0] === ring[ring.length - 1]) rings.push(ring.slice(0, -1))
  }
  return rings
}

/** Ring length excluding the repeated closing node (OSM closed ways repeat the first node last). */
function closedRingLength(points: Vec2[]): number {
  const first = points[0]
  const last = points[points.length - 1]
  return first.x === last.x && first.z === last.z ? points.length - 1 : points.length
}
