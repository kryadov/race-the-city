export interface LatLon { lat: number; lon: number }

/** Local ground-plane meters. x = east, z = south (north is -z). */
export interface Vec2 { x: number; z: number }

export type RoadKind =
  | 'motorway' | 'primary' | 'secondary' | 'residential' | 'service' | 'path' | 'other'

export interface Road { points: Vec2[]; kind: RoadKind; name?: string; bridge?: boolean; tunnel?: boolean }
/** What a building is for — decides its facade: windows, doors and signage. */
export type BuildingKind = 'house' | 'apartments' | 'retail' | 'office' | 'industrial' | 'civic'

export interface Building { footprint: Vec2[]; height: number; kind: BuildingKind }
export interface WorldData {
  roads: Road[]
  buildings: Building[]
  water: Vec2[][]
  green: Vec2[][]
  trees: Vec2[]
  coast: Vec2[][]
  railways: Vec2[][]
}
