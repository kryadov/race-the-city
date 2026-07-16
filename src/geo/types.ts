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
}
/** What a building is for — decides its facade: windows, doors and signage. */
/** A railway line. Trams share the street, so they carry trams and nothing else. */
export interface Railway { points: Vec2[]; tram: boolean }

export type PropKind = 'fountain' | 'statue' | 'flowerbed'
export interface Prop { at: Vec2; kind: PropKind }

export type BuildingKind = 'house' | 'apartments' | 'retail' | 'office' | 'industrial' | 'civic'

export interface Building { footprint: Vec2[]; height: number; kind: BuildingKind }
export interface WorldData {
  roads: Road[]
  buildings: Building[]
  water: Vec2[][]
  green: Vec2[][]
  parking: Vec2[][]
  trees: Vec2[]
  /** Ornaments dotted about: fountains, statues, flowerbeds. */
  props: Prop[]
  /** Open country: where livestock graze. */
  fields: Vec2[][]
  coast: Vec2[][]
  railways: Railway[]
}
