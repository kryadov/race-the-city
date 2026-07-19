import type { BBox } from './overpass'
import type { OverpassResponse } from './parse'

const DB_NAME = 'race-the-city'
const STORE = 'osm'

/** FNV-1a, base36 — short, stable, and no dependency. */
function hash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

/**
 * The key a city's OSM response is cached under: where it is, and what we asked
 * for.
 *
 * The query has to be in there. It was the bbox alone at first, and the query
 * has grown a great deal since — railways, water relations, fountains, parking,
 * the coastline. A city cached before any of that went on serving the answer
 * from before it, for good: no trams and no trains in a city full of them, and
 * nothing to suggest why.
 */
export function bboxKey(b: BBox, query: string): string {
  const r = (n: number) => n.toFixed(4)
  return `${r(b.south)},${r(b.west)},${r(b.north)},${r(b.east)}@${hash(query)}`
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function cacheGet(key: string): Promise<OverpassResponse | undefined> {
  try {
    const db = await openDb()
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
        tx.onsuccess = () => resolve(tx.result as OverpassResponse | undefined)
        tx.onerror = () => reject(tx.error)
      })
    } finally {
      db.close()
    }
  } catch {
    return undefined // caching is best-effort
  }
}

/**
 * Any cached OSM for this bbox, whatever query it was fetched under — a stale
 * last resort for when the network is refusing (Overpass 429s every mirror) and
 * the exact-query entry is a miss. Better a slightly out-of-date city than none.
 */
export async function cacheGetStale(b: BBox): Promise<OverpassResponse | undefined> {
  const prefix = bboxKey(b, '').split('@')[0] + '@' // "s,w,n,e@", any query hash after it
  try {
    const db = await openDb()
    try {
      return await new Promise((resolve) => {
        const store = db.transaction(STORE, 'readonly').objectStore(STORE)
        const keysReq = store.getAllKeys()
        keysReq.onsuccess = () => {
          const k = keysReq.result.find((x) => typeof x === 'string' && x.startsWith(prefix))
          if (typeof k !== 'string') {
            resolve(undefined)
            return
          }
          const getReq = store.get(k) // same transaction — issued synchronously so it stays open
          getReq.onsuccess = () => resolve(getReq.result as OverpassResponse | undefined)
          getReq.onerror = () => resolve(undefined)
        }
        keysReq.onerror = () => resolve(undefined)
      })
    } finally {
      db.close()
    }
  } catch {
    return undefined
  }
}

export async function cachePut(key: string, value: OverpassResponse): Promise<void> {
  try {
    const db = await openDb()
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key)
        tx.onsuccess = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
      await evictOtherQueries(db, key)
    } finally {
      db.close()
    }
  } catch {
    /* best-effort */
  }
}

/**
 * Drop what an older query cached. Each entry is a whole city's OSM — megabytes
 * — and once the query changes, every one of them is unreachable and unusable.
 */
async function evictOtherQueries(db: IDBDatabase, key: string): Promise<void> {
  const suffix = key.slice(key.indexOf('@'))
  await new Promise<void>((resolve) => {
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE)
    const req = store.getAllKeys()
    req.onsuccess = () => {
      for (const k of req.result) {
        if (typeof k === 'string' && !k.endsWith(suffix)) store.delete(k)
      }
      resolve()
    }
    req.onerror = () => resolve()
  })
}
