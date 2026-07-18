import { describe, it, expect, vi, afterEach } from 'vitest'
import { bboxAround, overpassQuery, fetchOsm } from '../../src/geo/overpass'

const BOX = { south: 41.71, west: 44.82, north: 41.72, east: 44.83 }

describe('bboxAround', () => {
  it('builds a symmetric box around the center', () => {
    const b = bboxAround({ lat: 41.7151, lon: 44.8271 }, 1000)
    expect(b.south).toBeLessThan(41.7151)
    expect(b.north).toBeGreaterThan(41.7151)
    expect(b.west).toBeLessThan(44.8271)
    expect(b.east).toBeGreaterThan(44.8271)
    // ~1km north offset is ~0.009 deg lat
    expect(b.north - 41.7151).toBeCloseTo(0.009, 2)
  })
})

describe('overpassQuery', () => {
  const q = overpassQuery(BOX)
  it('requests highways and buildings within the bbox', () => {
    expect(q).toContain('41.71,44.82,41.72,44.83')
    expect(q).toContain('highway')
    expect(q).toContain('building')
    expect(q).toContain('out')
  })
  it('asks for json output', () => {
    expect(q).toContain('[out:json]')
  })
  it('asks for a longer server-side timeout than the 25s that dropped São Paulo', () => {
    // At [timeout:25] the dense-downtown query hit the wall and came back empty.
    expect(q).not.toContain('[timeout:25]')
    const m = q.match(/\[timeout:(\d+)\]/)
    expect(m && Number(m[1])).toBeGreaterThanOrEqual(60)
  })
})

describe('fetchOsm', () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  const ok = (elements: unknown[], extra: object = {}) => ({
    ok: true,
    json: async () => ({ elements, ...extra }),
  })
  const queryOf = (init: unknown): string =>
    decodeURIComponent(String((init as { body: string }).body).replace(/^data=/, ''))

  it('fetches buildings and the other features as two separate requests, then merges them', async () => {
    // The fix for the São Paulo bug: buildings on their own survive a busy
    // server's timeout wall, so they must not ride in the same request as the
    // heavier rest of the query.
    const queries: string[] = []
    globalThis.fetch = vi.fn(async (_url: unknown, init: unknown) => {
      const q = queryOf(init)
      queries.push(q)
      return q.includes('way["building"]')
        ? ok([{ type: 'way', id: 1, tags: { building: 'yes' }, nodes: [] }])
        : ok([{ type: 'way', id: 2, tags: { highway: 'residential' }, nodes: [] }])
    }) as unknown as typeof fetch

    const res = await fetchOsm(BOX)

    expect(queries).toHaveLength(2)
    expect(queries.some((q) => q.includes('way["building"]') && !q.includes('highway'))).toBe(true)
    expect(queries.some((q) => q.includes('highway') && !q.includes('way["building"]'))).toBe(true)
    expect(res.elements.map((e) => e.id).sort()).toEqual([1, 2])
  })

  it('rejects a response that timed out server-side even though it is HTTP 200', async () => {
    // Overpass reports a timeout in a `remark`, not the status code. Caching that
    // partial body is exactly how the city ended up empty; a throw retries.
    globalThis.fetch = vi.fn(async () =>
      ok([], { remark: 'runtime error: Query timed out in "query" after 90 seconds.' }),
    ) as unknown as typeof fetch
    await expect(fetchOsm(BOX)).rejects.toThrow(/incomplete|timed out/i)
  })

  it('falls back to the second mirror when the first one errors', async () => {
    const urls: string[] = []
    globalThis.fetch = vi.fn(async (url: unknown) => {
      urls.push(String(url))
      if (String(url).includes('overpass-api.de')) throw new Error('network down')
      return ok([])
    }) as unknown as typeof fetch

    await expect(fetchOsm(BOX)).resolves.toEqual({ elements: [] })
    expect(urls.some((u) => u.includes('overpass-api.de'))).toBe(true)
    expect(urls.some((u) => u.includes('kumi.systems'))).toBe(true)
  })
})
