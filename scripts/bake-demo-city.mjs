// Bake the offline demo city asset: public/demo/paris.json
//
// Fetches one ~1km box of OpenStreetMap (the same tags the game asks Overpass for)
// plus a coarse elevation grid (Open-Meteo, the same provider the game uses for
// weather), and writes a single self-contained JSON the app ships in the repo so
// the very first screen never depends on a live geocoder / Overpass / terrain API.
//
// Run manually when you want to refresh the demo — it is NOT part of `npm run build`:
//   node scripts/bake-demo-city.mjs
//
// Keep RADIUS/SEGMENTS below in step with the values the game builds with
// (src/app/main.ts RADIUS/GROUND_SEGMENTS) — the asset stores its own, and the
// runtime rebuilds the grid at whatever `segments` the file records, so a mismatch
// is safe but a matching extent keeps the demo the same size as a real load.

import { writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'public', 'demo', 'paris.json')

// Île de la Cité, Paris — the Seine with its islands (shows off the water holes),
// several bridges, dense Haussmann blocks, Notre-Dame as a landmark, tight streets.
const NAME = 'Paris — Île de la Cité'
const CENTER = { lat: 48.8554, lon: 2.3475 }
const RADIUS = 1000 // metres, half-extent — matches the game's RADIUS
const SEGMENTS = 16 // a coarse 17×17 height grid; the runtime interpolates + re-grids to the mesh.
// Central Paris is near-flat, so a coarse grid is faithful — and it keeps the
// elevation fetch to a few Open-Meteo requests instead of hundreds (which the free
// tier rate-limits hard).

const M_PER_DEG_LAT = 111320
const mPerDegLon = M_PER_DEG_LAT * Math.cos((CENTER.lat * Math.PI) / 180)

// Local ground metres (x east, z south) → lat/lon. Mirrors Projector.toLatLon.
function toLatLon(x, z) {
  return {
    lat: CENTER.lat - z / M_PER_DEG_LAT,
    lon: CENTER.lon + x / mPerDegLon,
  }
}

function bbox() {
  const dLat = RADIUS / M_PER_DEG_LAT
  const dLon = RADIUS / mPerDegLon
  return {
    south: CENTER.lat - dLat,
    north: CENTER.lat + dLat,
    west: CENTER.lon - dLon,
    east: CENTER.lon + dLon,
  }
}

const TIMEOUT_S = 90
function buildingsQuery(b) {
  const box = `${b.south},${b.west},${b.north},${b.east}`
  return `[out:json][timeout:${TIMEOUT_S}];\n(\n  way["building"](${box});\n);\nout body;\n>;\nout skel qt;`
}
function featuresQuery(b) {
  const box = `${b.south},${b.west},${b.north},${b.east}`
  return `[out:json][timeout:${TIMEOUT_S}];
(
  way["highway"](${box});
  way["natural"="water"](${box});
  relation["natural"="water"](${box});
  way["waterway"="riverbank"](${box});
  way["landuse"="reservoir"](${box});
  way["amenity"="parking"](${box});
  way["leisure"~"park|garden|pitch"](${box});
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

const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function runOverpass(query) {
  // A UA is required — overpass-api.de answers 406 to a header-less client — and
  // a busy mirror 429s, so we try each mirror with a couple of backoff passes.
  let lastErr
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const url of OVERPASS) {
      try {
        process.stdout.write(`  overpass ${url} … `)
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
            'User-Agent': 'race-the-city demo baker (github.com/race-the-city)',
          },
          body: 'data=' + encodeURIComponent(query),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        if (json.remark && /timed out|out of memory/i.test(json.remark)) {
          throw new Error(`incomplete: ${json.remark}`)
        }
        console.log(`ok (${json.elements.length} elements)`)
        return json.elements
      } catch (e) {
        console.log(`fail (${e.message})`)
        lastErr = e
        await sleep(3000) // back off before the next mirror / pass
      }
    }
  }
  throw lastErr
}

// Open-Meteo elevation: up to 100 coordinates per request. We sample a coarse grid
// and let the runtime interpolate — for a near-flat city that is indistinguishable
// from the full-resolution DEM, at a fraction of the asset size.
async function fetchElevations(points) {
  const out = new Array(points.length)
  const BATCH = 100
  for (let start = 0; start < points.length; start += BATCH) {
    const chunk = points.slice(start, start + BATCH)
    const lat = chunk.map((p) => p.lat.toFixed(6)).join(',')
    const lon = chunk.map((p) => p.lon.toFixed(6)).join(',')
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`
    let json
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url)
      if (res.ok) {
        json = await res.json()
        break
      }
      if (res.status === 429 && attempt < 6) {
        await sleep(5000 * (attempt + 1)) // free tier throttles bursts — back off and retry
        continue
      }
      throw new Error(`elevation HTTP ${res.status}`)
    }
    for (let k = 0; k < chunk.length; k++) out[start + k] = json.elevation[k]
    process.stdout.write(`\r  elevation ${Math.min(start + BATCH, points.length)}/${points.length}`)
    await new Promise((r) => setTimeout(r, 1200)) // be gentle with the free API
  }
  console.log('')
  return out
}

async function main() {
  const b = bbox()
  console.log(`Baking "${NAME}" @ ${CENTER.lat},${CENTER.lon}  (±${RADIUS}m)`)

  console.log('OSM:')
  // Sequentially, not in parallel — two simultaneous hits on the same busy mirror
  // is a quick way to earn a 429.
  const buildings = await runOverpass(buildingsQuery(b))
  await sleep(2000)
  const features = await runOverpass(featuresQuery(b))
  const elements = [...buildings, ...features]

  // Trim the OSM to shrink the shipped asset: central Paris is one of the densest
  // boxes in OSM. Round node coordinates to 6 decimals (~0.1m — far finer than the
  // game needs) and keep only the fields parseOsm reads, dropping metadata Overpass
  // adds. Cuts the raw JSON by a large fraction with no visible change.
  const trimmed = elements.map((el) => {
    const out = { type: el.type, id: el.id }
    if (el.lat !== undefined) out.lat = Math.round(el.lat * 1e6) / 1e6
    if (el.lon !== undefined) out.lon = Math.round(el.lon * 1e6) / 1e6
    if (el.nodes) out.nodes = el.nodes
    if (el.members) out.members = el.members
    if (el.tags) out.tags = el.tags
    return out
  })

  // Coarse height grid, row-major, node (i,j) at local (x,z).
  const n = SEGMENTS + 1
  const step = (RADIUS * 2) / SEGMENTS
  const grid = []
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      grid.push(toLatLon(-RADIUS + i * step, -RADIUS + j * step))
    }
  }
  console.log(`Elevation: ${grid.length} points`)
  const raw = await fetchElevations(grid)
  const heights = raw.map((h) => Math.round((h ?? 0) * 10) / 10) // 1-dp, small JSON

  const asset = { name: NAME, center: CENTER, radius: RADIUS, segments: SEGMENTS, elements: trimmed, heights }
  await mkdir(dirname(OUT), { recursive: true })
  const json = JSON.stringify(asset)
  await writeFile(OUT, json)
  console.log(`\nWrote ${OUT}`)
  console.log(`  ${trimmed.length} OSM elements, ${heights.length} heights`)
  console.log(`  ${(json.length / 1024 / 1024).toFixed(2)} MB raw`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
