import type { BBox } from './overpass'
import type { OverpassResponse } from './parse'

const DB_NAME = 'race-the-city'
const STORE = 'osm'

export function bboxKey(b: BBox): string {
  const r = (n: number) => n.toFixed(4)
  return `${r(b.south)},${r(b.west)},${r(b.north)},${r(b.east)}`
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

export async function cachePut(key: string, value: OverpassResponse): Promise<void> {
  try {
    const db = await openDb()
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key)
        tx.onsuccess = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    } finally {
      db.close()
    }
  } catch {
    /* best-effort */
  }
}
