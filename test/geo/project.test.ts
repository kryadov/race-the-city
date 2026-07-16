import { describe, it, expect } from 'vitest'
import { Projector } from '../../src/geo/project'

const CENTER = { lat: 41.7151, lon: 44.8271 } // Tbilisi

describe('Projector', () => {
  it('maps the center to the origin', () => {
    const p = new Projector(CENTER)
    const v = p.toLocal(CENTER)
    expect(Math.abs(v.x)).toBeLessThan(1e-6)
    expect(Math.abs(v.z)).toBeLessThan(1e-6)
  })

  it('maps north (higher lat) to negative z', () => {
    const p = new Projector(CENTER)
    const v = p.toLocal({ lat: CENTER.lat + 0.001, lon: CENTER.lon })
    expect(v.z).toBeLessThan(0)
    expect(Math.abs(v.x)).toBeLessThan(0.01)
  })

  it('maps east (higher lon) to positive x', () => {
    const p = new Projector(CENTER)
    const v = p.toLocal({ lat: CENTER.lat, lon: CENTER.lon + 0.001 })
    expect(v.x).toBeGreaterThan(0)
  })

  it('roundtrips within a millimeter', () => {
    const p = new Projector(CENTER)
    const original = { lat: CENTER.lat + 0.002, lon: CENTER.lon - 0.003 }
    const back = p.toLatLon(p.toLocal(original))
    expect(Math.abs(back.lat - original.lat)).toBeLessThan(1e-7)
    expect(Math.abs(back.lon - original.lon)).toBeLessThan(1e-7)
  })

  it('scales ~111 km per degree of latitude', () => {
    const p = new Projector(CENTER)
    const v = p.toLocal({ lat: CENTER.lat + 1, lon: CENTER.lon })
    expect(Math.abs(v.z)).toBeGreaterThan(110000)
    expect(Math.abs(v.z)).toBeLessThan(112000)
  })
})
