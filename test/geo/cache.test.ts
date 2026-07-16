import { describe, it, expect } from 'vitest'
import { bboxKey } from '../../src/geo/cache'
import { overpassQuery } from '../../src/geo/overpass'

const BOX = { south: 41.71, west: 44.82, north: 41.72, east: 44.83 }
const QUERY = overpassQuery(BOX)

describe('bboxKey', () => {
  it('is stable and rounded for near-identical bboxes', () => {
    const a = bboxKey({ south: 41.710001, west: 44.820001, north: 41.72, east: 44.83 }, QUERY)
    const b = bboxKey({ south: 41.710002, west: 44.820002, north: 41.72, east: 44.83 }, QUERY)
    expect(a).toBe(b)
  })

  it('differs for clearly different bboxes', () => {
    const a = bboxKey(BOX, QUERY)
    const b = bboxKey({ south: 40.71, west: 43.82, north: 40.72, east: 43.83 }, QUERY)
    expect(a).not.toBe(b)
  })

  it('changes when the query asks for something new', () => {
    // The bug this exists for: the key was the bbox alone, so a city cached
    // before the query learned about railways went on serving that answer for
    // good — no trams, no trains, no rivers, in a city that has them.
    const before = bboxKey(BOX, 'way["highway"];')
    const after = bboxKey(BOX, 'way["highway"];way["railway"];')
    expect(before).not.toBe(after)
  })

  it('keeps the bbox legible in the key', () => {
    expect(bboxKey(BOX, QUERY)).toContain('41.7100,44.8200,41.7200,44.8300')
  })
})
