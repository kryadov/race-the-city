import type { LatLon } from './types'
import type { OverpassResponse } from './parse'

export interface BBox { south: number; west: number; north: number; east: number }

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const M_PER_DEG_LAT = 111320

export function bboxAround(center: LatLon, radiusMeters: number): BBox {
  const dLat = radiusMeters / M_PER_DEG_LAT
  const dLon = radiusMeters / (M_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180))
  return {
    south: center.lat - dLat,
    north: center.lat + dLat,
    west: center.lon - dLon,
    east: center.lon + dLon,
  }
}

export function overpassQuery(b: BBox): string {
  const box = `${b.south},${b.west},${b.north},${b.east}`
  return `[out:json][timeout:25];
(
  way["highway"](${box});
  way["building"](${box});
  way["natural"="water"](${box});
  relation["natural"="water"](${box});
  way["waterway"="riverbank"](${box});
  way["landuse"="reservoir"](${box});
  way["amenity"="parking"](${box});
  way["leisure"~"park|garden"](${box});
  way["natural"~"wood|scrub"](${box});
  way["landuse"~"grass|forest|meadow|recreation_ground|village_green"](${box});
  way["landuse"~"farmland|farmyard|animal_keeping|orchard"](${box});
  node["natural"="tree"](${box});
  node["amenity"="fountain"](${box});
  way["amenity"="fountain"](${box});
  node["tourism"~"attraction|museum|artwork|viewpoint|gallery"](${box});
  way["tourism"~"attraction|museum|artwork|viewpoint|gallery"](${box});
  node["historic"~"monument|memorial|castle|ruins"](${box});
  way["historic"~"monument|memorial|castle|ruins"](${box});
  way["landuse"="flowerbed"](${box});
  way["natural"="coastline"](${box});
  way["railway"~"rail|light_rail|tram|narrow_gauge"](${box});
  node["amenity"="bench"](${box});
  node["highway"="bus_stop"](${box});
  node["amenity"="cafe"](${box});
  node["amenity"="fuel"](${box});
);
out body;
>;
out skel qt;`
}

export async function fetchOsm(bbox: BBox): Promise<OverpassResponse> {
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(overpassQuery(bbox)),
  })
  if (!res.ok) throw new Error(`Overpass error ${res.status}`)
  return (await res.json()) as OverpassResponse
}
