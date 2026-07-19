import type { LatLon } from './types'
import type { OverpassResponse } from './parse'

export interface BBox { south: number; west: number; north: number; east: number }

// Two public mirrors, tried in order. overpass-api.de is the busiest instance
// and the first to make a heavy query hit its timeout wall; kumi.systems is the
// fallback for when it errors or times out. This app has no backend of its own
// to proxy through, so resilience has to come from asking a second server.
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]
const M_PER_DEG_LAT = 111320

/**
 * Server-side execution budget, in seconds. Raised well above the old 25: São
 * Paulo's downtown is ~6500 buildings in a 1km box, and at [timeout:25] the
 * combined query hit this wall whenever the public server was busy — and a
 * query that hits the wall comes back HTTP 200 (so it looks like success) with
 * a `remark` and a partial or empty element list. The city then rendered with
 * almost no buildings. The headroom is for the densest downtowns under load.
 */
const TIMEOUT_S = 90

/**
 * Client-side ceiling per mirror. `fetch` has no timeout of its own, so a request
 * that a busy Overpass queues (or never answers) would hang until the browser's
 * own ~5-minute wall — the "загружаю карту OSM" that never clears. We abort well
 * before that and fail over to the other mirror / the next withRetry attempt.
 * Comfortably above the server-side TIMEOUT_S so a genuinely slow-but-working
 * query still lands, well below the browser hang.
 */
const REQUEST_TIMEOUT_MS = 100_000

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

/**
 * Just the buildings. Split out from everything else because in a dense city
 * they are the bulk of the response, and the bulk is what makes a combined query
 * heavy enough to time out. On their own they gather in a few seconds and come
 * back whole even when the busy server would have timed the fuller query out —
 * so São Paulo keeps its skyline instead of rendering empty.
 */
function buildingsQuery(b: BBox): string {
  const box = `${b.south},${b.west},${b.north},${b.east}`
  return `[out:json][timeout:${TIMEOUT_S}];
(
  way["building"](${box});
);
out body;
>;
out skel qt;`
}

/**
 * Everything that isn't a building: roads, water, greenery, railways, the props
 * and the signposted points of interest. Lighter than the buildings, and asked
 * for separately so that if it does time out on a busy server the buildings —
 * fetched in their own request — are unaffected.
 */
function featuresQuery(b: BBox): string {
  const box = `${b.south},${b.west},${b.north},${b.east}`
  return `[out:json][timeout:${TIMEOUT_S}];
(
  way["highway"](${box});
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

/**
 * The full set of tags we ask OSM for, as one string. It is no longer sent as a
 * single request — fetchOsm splits the buildings off so a dense city survives a
 * server timeout — but it still stands in for "what we asked for" in the cache
 * key: change either half and the string changes, so a city cached under the
 * old combined query is re-fetched rather than served the stale, half-empty
 * answer that split query would never have produced.
 */
export function overpassQuery(b: BBox): string {
  return `${buildingsQuery(b)}\n${featuresQuery(b)}`
}

/**
 * Run one Overpass query, trying each mirror until one answers cleanly.
 *
 * A timed-out response is treated as a failure even though it arrives HTTP 200:
 * Overpass reports a server-side timeout (or an out-of-memory) in a `remark`
 * field, not in the status code, and the body that comes with it is partial or
 * empty. Cached as-is it would strand the city half-built for good — the São
 * Paulo bug. Throwing instead lets the next mirror, and main's withRetry, try
 * again for a whole answer.
 */
async function runQuery(query: string, signal?: AbortSignal): Promise<OverpassResponse> {
  let lastErr: unknown
  for (const url of OVERPASS_ENDPOINTS) {
    // Abort a mirror that hangs (queued behind a busy server) so we fail over
    // rather than waiting on the browser's ~5-minute wall. An outer `signal` (a
    // user pressing Cancel) aborts it too, and is not retried against.
    const ctrl = new AbortController()
    const onOuterAbort = (): void => ctrl.abort()
    if (signal) {
      if (signal.aborted) ctrl.abort()
      else signal.addEventListener('abort', onOuterAbort)
    }
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
        signal: ctrl.signal,
      })
      if (!res.ok) throw new Error(`Overpass error ${res.status}`)
      const json = (await res.json()) as OverpassResponse & { remark?: string }
      if (json.remark && /timed out|out of memory/i.test(json.remark)) {
        throw new Error(`Overpass incomplete: ${json.remark}`)
      }
      return json
    } catch (e) {
      lastErr = e
      if (signal?.aborted) throw e // the user cancelled — stop, don't try more mirrors
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onOuterAbort)
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Overpass request failed')
}

/**
 * Fetch the city's OSM as two requests — buildings, and everything else — and
 * merge the results into one element list.
 *
 * They are split because as a single combined query a dense downtown is heavy
 * enough to hit Overpass's server-side timeout under load, and a timed-out query
 * answers HTTP 200 with a partial body: São Paulo, ~6500 buildings in a 1km box,
 * came back with almost none. Buildings fetched on their own gather fast and
 * survive that wall. The two responses share their corner nodes, but nodes
 * dedupe by id in parseOsm, so merging is a plain concatenation.
 */
export async function fetchOsm(bbox: BBox, signal?: AbortSignal): Promise<OverpassResponse> {
  const [buildings, features] = await Promise.all([
    runQuery(buildingsQuery(bbox), signal),
    runQuery(featuresQuery(bbox), signal),
  ])
  return { elements: [...buildings.elements, ...features.elements] }
}
