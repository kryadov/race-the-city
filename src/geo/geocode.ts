import type { LatLon } from './types'

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

export function nominatimUrl(query: string): string {
  // Several hits, not one: the top hit for a city is often its administrative
  // boundary, and we want the settlement that comes further down the list.
  return `${NOMINATIM_URL}?format=json&limit=8&q=${encodeURIComponent(query)}`
}

interface NominatimHit { lat: string; lon: string; class?: string; type?: string }

/** place types that name somewhere you could actually drive around. */
const SETTLEMENTS = new Set(['city', 'town', 'village', 'hamlet', 'borough', 'suburb', 'municipality'])

/**
 * Nominatim ranks by importance, and its top hit for a place name is regularly
 * the wrong thing to drive to. Pick in tiers instead:
 *
 *  1. the settlement node — the town centre you actually want;
 *  2. an administrative boundary — usable, though for a city that is also a
 *     region its point is the centroid of the whole subject;
 *  3. whatever came first.
 *
 * Both tiers earn their keep: "санкт-петербург" ranks the federal subject's
 * boundary first, whose centroid is 9km out in the Gulf of Finland (the player
 * got a square kilometre of open water), and "Кронштадт" ranks an aerodrome
 * first, with the real town only reachable via its boundary.
 */
export function parseNominatim(json: unknown): LatLon {
  const arr = json as NominatimHit[]
  if (!Array.isArray(arr) || arr.length === 0) throw new Error('city not found')
  const hit =
    arr.find((h) => h.class === 'place' && !!h.type && SETTLEMENTS.has(h.type)) ??
    arr.find((h) => h.class === 'boundary' && h.type === 'administrative') ??
    arr[0]
  return { lat: parseFloat(hit.lat), lon: parseFloat(hit.lon) }
}

/** Accepts "lat,lon" directly, otherwise geocodes the free-text query. */
export async function geocode(query: string): Promise<LatLon> {
  const coord = query.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/)
  if (coord) return { lat: parseFloat(coord[1]), lon: parseFloat(coord[2]) }
  const res = await fetch(nominatimUrl(query), { headers: { 'Accept-Language': 'en' } })
  if (!res.ok) throw new Error(`Geocoding error ${res.status}`)
  return parseNominatim(await res.json())
}
