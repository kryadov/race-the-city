export interface LatLon { lat: number; lon: number }

/** Local ground-plane meters. x = east, z = south (north is -z). */
export interface Vec2 { x: number; z: number }

export type RoadKind =
  | 'motorway' | 'primary' | 'secondary' | 'residential' | 'service' | 'path' | 'other'

export interface Road {
  points: Vec2[]
  kind: RoadKind
  name?: string
  bridge?: boolean
  tunnel?: boolean
  /** OSM `layer`: how many levels above (or below) the ground this way runs. */
  layer?: number
  /** This way IS a dedicated cycleway, or carries a `cycleway=lane|track|…` tag, so
   *  a coloured cycle-lane stripe is painted along it in the road-detail layer. */
  cycleway?: boolean
}

/** What a sports pitch is for — decides its markings and end furniture (goals vs
 *  a hoop). `generic` is any pitch with no `sport` we recognise. */
export type PitchSport = 'soccer' | 'basketball' | 'tennis' | 'generic'
/** A sports pitch: its OSM outline ring and the sport it is played for. */
export interface Pitch { ring: Vec2[]; sport: PitchSport }
/** What a building is for — decides its facade: windows, doors and signage. */
/**
 * A railway line. Trams share the street, so they carry trams and nothing else;
 * a tunnel is underground, so it carries nothing you can see.
 */
export interface Railway { points: Vec2[]; tram: boolean; tunnel: boolean }

export type PropKind = 'fountain' | 'statue' | 'flowerbed'
export interface Prop { at: Vec2; kind: PropKind }

/** A signposted point of interest: cafés, fuel stations and landmarks. */
export type PoiKind = 'cafe' | 'fuel' | 'landmark'
export interface Poi { x: number; z: number; kind: PoiKind }

export type BuildingKind = 'house' | 'apartments' | 'retail' | 'office' | 'industrial' | 'civic'

export interface Building { footprint: Vec2[]; height: number; kind: BuildingKind }

/** A land-use area the ground is tinted for — the country and the built-up land
 * a plain grass fill flattens: `farmland` warm cropland, `meadow` rough grass,
 * `orchard`/scrub tree-cover, `residential` (and commercial/industrial) built-up
 * ground. See classifySurface in parse.ts for the tag map. */
export type SurfaceKind = 'farmland' | 'meadow' | 'orchard' | 'residential'
export interface Surface { kind: SurfaceKind; ring: Vec2[] }
export interface WorldData {
  roads: Road[]
  buildings: Building[]
  water: Vec2[][]
  green: Vec2[][]
  /** Wooded tracts (`natural=wood`, `landuse=forest`) — a subset of `green`, so
   * the ground still tints under them; carried apart so greenery.ts can fill them
   * with trees far denser than a park's scatter. */
  forests: Vec2[][]
  parking: Vec2[][]
  trees: Vec2[]
  /** Ornaments dotted about: fountains, statues, flowerbeds. */
  props: Prop[]
  /** Open country: where livestock graze. */
  fields: Vec2[][]
  /** Land-use areas painted as distinct flat ground tints — farmland, meadow,
   * orchard/scrub and built-up (residential/commercial/industrial) land. Kept
   * apart from `green` (park lawns) so each reads as its own colour; a farmland or
   * meadow is *also* filed under `green`/`fields`, so its tint here just overrides
   * the generic greenery where they overlap. */
  surfaces: Surface[]
  coast: Vec2[][]
  /** Sports pitches (`leisure=pitch`) — a marked playing field with goals or a hoop. */
  pitches: Pitch[]
  railways: Railway[]
  /** Street furniture points: benches (`amenity=bench`) and bus stops. */
  benches: Vec2[]
  busStops: Vec2[]
  /** Signposted points of interest: cafés, fuel stations and landmarks. */
  pois: Poi[]
}
