import type { Projector } from './project'
import type { Building, BuildingKind, Pitch, PitchSport, Poi, Prop, PropKind, Railway, Road, RoadKind, Surface, SurfaceKind, Vec2, WorldData } from './types'

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

// Sights worth a beacon: the tourist and historic tags a visitor would detour
// for. A few (monument, memorial, artwork) also raise a statue prop — the model
// is the sight, the beacon marks it — so this is checked alongside, not instead.
const LANDMARK_TOURISM = new Set(['attraction', 'museum', 'artwork', 'viewpoint', 'gallery'])
const LANDMARK_HISTORIC = new Set(['monument', 'memorial', 'castle', 'ruins'])

/** True when this tagging names a landmark to signpost. */
export function isLandmark(tags: Record<string, string>): boolean {
  return LANDMARK_TOURISM.has(tags.tourism) || LANDMARK_HISTORIC.has(tags.historic)
}

const FIELD_LANDUSE = new Set(['farmland', 'farmyard', 'animal_keeping', 'meadow', 'orchard'])

/** Open country — grazing land, near enough. */
export function isField(tags: Record<string, string>): boolean {
  return FIELD_LANDUSE.has(tags.landuse)
}

export function isParking(tags: Record<string, string>): boolean {
  // Multi-storey and underground parking are buildings, not painted tarmac.
  return tags.amenity === 'parking' && !tags.building && tags.parking !== 'underground' && tags.parking !== 'multi-storey'
}

/** A sports pitch (`leisure=pitch`) — a marked playing field. */
export function isPitch(tags: Record<string, string>): boolean {
  return tags.leisure === 'pitch'
}

// The sports we lay a recognisable field for; anything else is a generic pitch
// (still a green field with an outline, just no sport-specific furniture).
const PITCH_SPORT: Record<string, PitchSport> = {
  soccer: 'soccer', football: 'soccer',
  basketball: 'basketball',
  tennis: 'tennis',
}

/** Which sport a pitch is for. `sport=soccer;basketball` picks the first listed. */
export function pitchSport(tags: Record<string, string>): PitchSport {
  const first = (tags.sport ?? '').split(';')[0].trim()
  return PITCH_SPORT[first] ?? 'generic'
}

// The `cycleway=*` values that mean the road carries a cycle lane worth painting.
// `separate` / `no` do not (the cyclists have their own way, or there is none).
const CYCLE_LANE_VALUES = new Set([
  'lane', 'track', 'opposite_lane', 'opposite_track', 'shared_lane', 'both', 'left', 'right', 'yes',
])

/**
 * True when this way is a cycle route to stripe: a dedicated `highway=cycleway`,
 * or an ordinary road carrying a `cycleway=lane|track|…` (or a side-specific
 * `cycleway:left|right|both=lane|track`) tag. These ways are already fetched by
 * the existing `way["highway"]` query, so this needs no Overpass change.
 */
export function hasCycleLane(tags: Record<string, string>): boolean {
  if (tags.highway === 'cycleway') return true
  if (CYCLE_LANE_VALUES.has(tags.cycleway)) return true
  for (const k of ['cycleway:left', 'cycleway:right', 'cycleway:both']) {
    const v = tags[k]
    if (v && v !== 'no' && v !== 'separate') return true
  }
  return false
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

/** A wooded tract — a лесомассив, not a lawn. A subset of `isGreen`, singled out
 * so greenery.ts can pack it with trees instead of scattering a park's handful. */
export function isForest(tags: Record<string, string>): boolean {
  return tags.natural === 'wood' || tags.landuse === 'forest'
}

// Land-use → ground tint. OSM carto paints these areas distinctly (cream farmland,
// pale meadow, dotted orchard, grey built-up land); on a plain grass fill they all
// vanish. Two maps, checked landuse-first: the `landuse` tag is the primary one,
// with a couple of `natural` covers folded into the nearest tint (grassland/heath
// read as meadow, scrub as an orchard's patchy tree-cover).
const SURFACE_LANDUSE: Record<string, SurfaceKind> = {
  farmland: 'farmland', farmyard: 'farmland',
  meadow: 'meadow',
  orchard: 'orchard', vineyard: 'orchard',
  residential: 'residential', commercial: 'residential', industrial: 'residential',
}
const SURFACE_NATURAL: Record<string, SurfaceKind> = {
  grassland: 'meadow', heath: 'meadow',
  scrub: 'orchard',
}

/** The land-use tint this area carries, or null if it isn't one we paint. */
export function classifySurface(tags: Record<string, string>): SurfaceKind | null {
  return SURFACE_LANDUSE[tags.landuse] ?? SURFACE_NATURAL[tags.natural] ?? null
}

/**
 * A pedestrian PLAZA — a `highway=pedestrian` area to pave, not a pedestrian street
 * to draw as a line. It's an area when tagged `area=yes`, or when the way closes on
 * itself (a plaza is a ring); `area=no` forces the line reading. `closed` is whether
 * the way's first and last node are the same. Pure/testable.
 */
export function isPedestrianArea(tags: Record<string, string>, closed: boolean): boolean {
  if (tags.highway !== 'pedestrian' || tags.area === 'no') return false
  return tags.area === 'yes' || closed
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
  let trees: Vec2[] = []
  const props: Prop[] = []
  const benches: Vec2[] = []
  const busStops: Vec2[] = []
  const pois: Poi[] = []
  // Landmark points from nodes and ways, gathered raw here and only deduped and
  // capped once every element has been seen (a sight is often tagged twice).
  const landmarkPts: Vec2[] = []
  for (const el of json.elements) {
    if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined) {
      const local = projector.toLocal({ lat: el.lat, lon: el.lon })
      nodes.set(el.id, local)
      const tags = el.tags
      if (tags && isLandmark(tags)) landmarkPts.push(local)
      if (tags?.natural === 'tree') trees.push(local)
      else if (tags?.amenity === 'bench') benches.push(local)
      else if (tags?.highway === 'bus_stop') busStops.push(local)
      else if (tags?.amenity === 'cafe') pois.push({ x: local.x, z: local.z, kind: 'cafe' })
      else if (tags?.amenity === 'fuel') pois.push({ x: local.x, z: local.z, kind: 'fuel' })
      else {
        const kind = classifyProp(tags ?? {})
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
  const waterHoles: Vec2[][] = []
  const green: Vec2[][] = []
  const forests: Vec2[][] = []
  const parking: Vec2[][] = []
  const pitches: Pitch[] = []
  const fields: Vec2[][] = []
  const surfaces: Surface[] = []
  const coast: Vec2[][] = []
  const railWays: { nodes: number[]; tram: boolean; tunnel: boolean }[] = []
  // Named water bodies, first anchor per name — a river is often many ways/one
  // relation sharing "La Seine"; we label it once, at that first body's centroid.
  const waterNamed = new Map<string, Vec2>()

  for (const el of json.elements) {
    if (el.type !== 'way' || !el.nodes || el.nodes.length < 2) continue
    const tags = el.tags ?? {}
    const points = el.nodes.map((id) => nodes.get(id)).filter((p): p is Vec2 => !!p)
    if (points.length < 2) continue

    if (isLandmark(tags)) landmarkPts.push(centroid(points))

    const propKind = classifyProp(tags)
    if (propKind) {
      props.push({ at: centroid(points), kind: propKind })
      continue
    }

    // Land-use tint, collected independently of the green/field/building chain
    // below: a farmland is grazing land (fields) and greenery (green) *and* a
    // khaki surface, and a residential tract is none of those but still tints the
    // built-up ground the parks never cover. So it rides alongside, not instead.
    const surfaceKind = classifySurface(tags)
    if (surfaceKind) {
      const ring = points.length > 2 ? points.slice(0, closedRingLength(points)) : points
      if (ring.length >= 3) surfaces.push({ kind: surfaceKind, ring })
    }

    if (tags.natural === 'coastline') {
      coast.push(points) // linear boundary between land and sea
    } else if (isWater(tags)) {
      const ring = points.length > 2 ? points.slice(0, closedRingLength(points)) : points
      if (ring.length >= 3) {
        water.push(ring)
        if (tags.name && span(ring) >= MIN_NAMED_WATER_SPAN && !waterNamed.has(tags.name)) {
          waterNamed.set(tags.name, centroid(ring))
        }
      }
    } else if (isParking(tags)) {
      const ring = points.length > 2 ? points.slice(0, closedRingLength(points)) : points
      if (ring.length >= 3) parking.push(ring)
    } else if (isPitch(tags)) {
      const ring = points.length > 2 ? points.slice(0, closedRingLength(points)) : points
      if (ring.length >= 3) pitches.push({ ring, sport: pitchSport(tags) })
    } else if (isGreen(tags) || isField(tags)) {
      const ring = points.length > 2 ? points.slice(0, closedRingLength(points)) : points
      if (ring.length >= 3) {
        green.push(ring)
        if (isField(tags)) fields.push(ring) // still greenery; also grazing
        if (isForest(tags)) forests.push(ring) // still greenery; also a wood to fill
      }
    } else if (isRailway(tags)) {
      railWays.push({
        nodes: el.nodes,
        tram: tags.railway === 'tram',
        tunnel: !!tags.tunnel && tags.tunnel !== 'no',
      })
    } else if (tags.building) {
      const ring = points.length > 2 ? points.slice(0, closedRingLength(points)) : points
      if (ring.length >= 3) buildings.push({ footprint: ring, height: buildingHeight(tags), kind: classifyBuilding(tags) })
    } else if (isPedestrianArea(tags, el.nodes.length > 3 && el.nodes[0] === el.nodes[el.nodes.length - 1])) {
      // A pedestrian plaza: paved ground, not a path line traced round its edge.
      const ring = points.length > 2 ? points.slice(0, closedRingLength(points)) : points
      if (ring.length >= 3) surfaces.push({ kind: 'paved', ring })
    } else if (tags.highway) {
      const road: Road = { points, kind: classifyRoad(tags.highway) }
      if (tags.name) road.name = tags.name
      if (tags.bridge && tags.bridge !== 'no') road.bridge = true
      if (tags.tunnel && tags.tunnel !== 'no') road.tunnel = true
      if (hasCycleLane(tags)) road.cycleway = true
      const layer = parseInt(tags.layer, 10)
      if (!Number.isNaN(layer) && layer !== 0) road.layer = layer
      roads.push(road)
    }
  }

  // Join the railway fragments into continuous lines, keeping trams apart from
  // the mainline: they are different networks that happen to share a tag.
  // Joined within each kind, never across: a surface line and the tunnel it dives
  // into are not one line, and neither are a tram track and a mainline.
  const railways: Railway[] = []
  for (const tram of [false, true]) {
    for (const tunnel of [false, true]) {
      const ways = railWays.filter((w) => w.tram === tram && w.tunnel === tunnel).map((w) => w.nodes)
      for (const chain of joinChains(ways)) {
        const points = chain.map((id) => nodes.get(id)).filter((p): p is Vec2 => !!p)
        if (points.length >= 2) railways.push({ points, tram, tunnel })
      }
    }
  }

  // Multipolygon relations: the only way big rivers (the Neva, the Moskva), large
  // forest tracts (a лесомассив), and complex buildings (courtyard blocks, church
  // complexes, anything with a hole or many outlines) are mapped — they never
  // arrive as a single closed way. A dense downtown like Boston or São Paulo maps a
  // real share of its footprints this way, and reading only `way["building"]`
  // dropped them, so the city came up almost bare. A wood is filed as greenery too
  // (so the ground tints under it) and as a forest (so greenery.ts plants it
  // densely); a building outer ring becomes a Building, exactly as the way loop does.
  for (const el of json.elements) {
    if (el.type !== 'relation' || !el.members) continue
    const tags = el.tags ?? {}
    const asWater = isWater(tags)
    const asForest = isForest(tags)
    const asBuilding = !!tags.building
    if (!asWater && !asForest && !asBuilding) continue
    if (el.members.length > MAX_RELATION_MEMBERS) continue // a whole-river monster
    const outers: number[][] = []
    const inners: number[][] = [] // islands (water) / clearings — cut from the surface
    for (const mem of el.members) {
      if (mem.type !== 'way') continue
      const ns = wayNodes.get(mem.ref)
      if (!ns || ns.length < 2) continue
      if (mem.role === 'inner') inners.push(ns)
      else if (!mem.role || mem.role === 'outer') outers.push(ns)
    }
    const relWaterPts: Vec2[] = [] // outer points of this water relation, for its label anchor
    for (const ringIds of stitchRings(outers)) {
      const pts = ringToPoints(ringIds, nodes)
      if (!pts) continue
      if (asWater) {
        water.push(pts)
        for (const p of pts) relWaterPts.push(p)
      }
      if (asForest) {
        green.push(pts)
        forests.push(pts)
      }
      // A building relation's outer ring is a footprint. A courtyard (inner ring) is
      // left uncut — Building has no holes, so the yard fills solid, which reads far
      // better than the whole block missing. Height/kind come off the relation tags.
      if (asBuilding && pts.length >= 3) {
        buildings.push({ footprint: pts, height: buildingHeight(tags), kind: classifyBuilding(tags) })
      }
    }
    // Big rivers (the Seine, the Neva) arrive as one named relation — label it at
    // the centroid of its outer rings, once per name.
    if (asWater && tags.name && span(relWaterPts) >= MIN_NAMED_WATER_SPAN && !waterNamed.has(tags.name)) {
      waterNamed.set(tags.name, centroid(relWaterPts))
    }
    // Islands: an inner ring of a WATER body is land the surface must not paint
    // over, so carry it as a hole to cut. (Forest clearings are left for now — a
    // clearing in a wood just gets no extra trees, which is harmless.)
    if (asWater) {
      for (const ringIds of stitchRings(inners)) {
        const pts = ringToPoints(ringIds, nodes)
        if (pts) waterHoles.push(pts)
      }
    }
  }

  // One sight is often tagged twice — a museum node inside its building outline,
  // a monument node on the ruins around it — so snap to a coarse grid and keep
  // one beacon per cell. Then cap the lot, the way trees and props are capped,
  // so a monument-dense old town doesn't sprout a forest of signposts.
  for (const at of dedupeByCell(landmarkPts, LANDMARK_MERGE_M).slice(0, MAX_LANDMARKS)) {
    pois.push({ x: at.x, z: at.z, kind: 'landmark' })
  }

  // A monument arrives as a statue prop, and OSM often maps a tree on or beside
  // the very same spot (a node a metre over, or the greenery the monument stands
  // in) — so a statue can end up planted inside a tree. Drop any tree that falls
  // within a statue's clear radius; the statue stays exactly where it is and the
  // world is otherwise identical. Statues are a sparse subset of props (only
  // monuments, memorials and artworks — a handful even in an old town), so this
  // statues×trees guarded pass is cheap and runs once, here at parse time.
  const statues = props.filter((p) => p.kind === 'statue')
  if (statues.length && trees.length) {
    const clearSq = STATUE_TREE_CLEAR_M * STATUE_TREE_CLEAR_M
    trees = trees.filter((t) =>
      !statues.some((s) => {
        const dx = t.x - s.at.x
        const dz = t.z - s.at.z
        return dx * dx + dz * dz < clearSq
      }),
    )
  }

  const waterNames = [...waterNamed.entries()].map(([name, at]) => ({ name, at }))
  return { roads, buildings, water, waterHoles, green, forests, parking, pitches, fields, surfaces, trees, props, coast, railways, benches, busStops, pois, waterNames }
}

/** Skip a relation with more members than this — a whole-river monster. */
export const MAX_RELATION_MEMBERS = 600

/** How far apart two landmark points must be to count as separate sights. */
const LANDMARK_MERGE_M = 15
/** A budget cap on landmark beacons — sparse in most cities, dense in old towns. */
const MAX_LANDMARKS = 300

/** How close a tree may stand to a statue before it is cleared away, in metres —
 * a bit more than the widest statue footprint, so a monument never grows out of
 * a trunk (see props.ts VARIANTS: the equestrian plinth, the widest, is ~1.3m). */
const STATUE_TREE_CLEAR_M = 2.5

/** The average of a ring's vertices — near enough its middle for a marker. */
function centroid(points: Vec2[]): Vec2 {
  let cx = 0
  let cz = 0
  for (const p of points) {
    cx += p.x
    cz += p.z
  }
  return { x: cx / points.length, z: cz / points.length }
}

/**
 * The wider of a ring's bounding-box sides, metres. Used to tell a river or lake
 * (hundreds of metres) from a named fountain basin (a few metres) so only the
 * former earns a floating name — a labelled fountain every few paces is clutter.
 */
const MIN_NAMED_WATER_SPAN = 40
function span(points: Vec2[]): number {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.z < minZ) minZ = p.z
    if (p.z > maxZ) maxZ = p.z
  }
  return Math.max(maxX - minX, maxZ - minZ)
}

/** Drop points that share a grid cell, keeping the first seen — a cheap spatial
 * dedupe so two taggings of one sight don't stack two markers on the same spot. */
function dedupeByCell(points: Vec2[], cell: number): Vec2[] {
  const seen = new Set<string>()
  const out: Vec2[] = []
  for (const p of points) {
    const key = `${Math.round(p.x / cell)},${Math.round(p.z / cell)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
  }
  return out
}

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
/**
 * Resolve a ring of node ids to points — but every node or none. Dropping the ones
 * we haven't got leaves a ring with a gap in it, which is not a ring but a polygon
 * that cuts the corner across dry land, and anything floated on it sails over a
 * field. Returns null for a partial ring or one too small to have an inside.
 */
function ringToPoints(ringIds: number[], nodes: Map<number, Vec2>): Vec2[] | null {
  const pts: Vec2[] = []
  for (const id of ringIds) {
    const p = nodes.get(id)
    if (!p) return null
    pts.push(p)
  }
  return pts.length >= 3 ? pts : null
}

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

/**
 * Join ways end to end into the longest continuous lines they make.
 *
 * OSM cuts a railway into a way per bridge, junction and boundary, so a single
 * line arrives as a heap of fragments whose ends happen to meet. Left alone,
 * each fragment ends in the middle of the map — and a train running one has to
 * do something at that end, in full view.
 *
 * Only joins where exactly TWO ways meet at a node. At a junction three or four
 * of them share it, and there is no such thing as "the continuation": joining
 * blindly walks the chain off into a branch and doubles it back on itself, which
 * a mitred ribbon renders as a fan of garbage triangles.
 *
 * Matched on node id: the ends are the same node, and comparing floats would
 * leave the join open over rounding.
 */
export function joinChains(ways: number[][]): number[][] {
  const pool = ways.filter((w) => w.length >= 2).map((w) => w.slice())

  // How many way-ends land on each node. Only a node with exactly two is an
  // unambiguous continuation; anything else is a junction.
  const ends = new Map<number, number>()
  for (const w of pool) {
    for (const id of [w[0], w[w.length - 1]]) ends.set(id, (ends.get(id) ?? 0) + 1)
  }
  const joinable = (id: number): boolean => ends.get(id) === 2

  const chains: number[][] = []
  while (pool.length) {
    let chain = pool.pop() as number[]
    let joined = true
    while (joined) {
      joined = false
      const head = chain[0]
      const tail = chain[chain.length - 1]
      for (let i = 0; i < pool.length; i++) {
        const w = pool[i]
        if (joinable(tail) && w[0] === tail) chain = chain.concat(w.slice(1))
        else if (joinable(tail) && w[w.length - 1] === tail) chain = chain.concat(w.slice(0, -1).reverse())
        else if (joinable(head) && w[w.length - 1] === head) chain = w.slice(0, -1).concat(chain)
        else if (joinable(head) && w[0] === head) chain = w.slice(1).reverse().concat(chain)
        else continue
        pool.splice(i, 1)
        joined = true
        break
      }
      // A ring: stop, or it walks itself forever.
      if (chain.length > 2 && chain[0] === chain[chain.length - 1]) break
    }
    chains.push(chain)
  }
  return chains
}

/** Ring length excluding the repeated closing node (OSM closed ways repeat the first node last). */
function closedRingLength(points: Vec2[]): number {
  const first = points[0]
  const last = points[points.length - 1]
  return first.x === last.x && first.z === last.z ? points.length - 1 : points.length
}
