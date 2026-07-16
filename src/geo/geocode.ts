import type { LatLon } from './types'

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

export function nominatimUrl(query: string): string {
  return `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(query)}`
}

interface NominatimHit { lat: string; lon: string }

export function parseNominatim(json: unknown): LatLon {
  const arr = json as NominatimHit[]
  if (!Array.isArray(arr) || arr.length === 0) throw new Error('city not found')
  return { lat: parseFloat(arr[0].lat), lon: parseFloat(arr[0].lon) }
}

/** Accepts "lat,lon" directly, otherwise geocodes the free-text query. */
export async function geocode(query: string): Promise<LatLon> {
  const coord = query.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/)
  if (coord) return { lat: parseFloat(coord[1]), lon: parseFloat(coord[2]) }
  const res = await fetch(nominatimUrl(query), { headers: { 'Accept-Language': 'en' } })
  if (!res.ok) throw new Error(`Geocoding error ${res.status}`)
  return parseNominatim(await res.json())
}
