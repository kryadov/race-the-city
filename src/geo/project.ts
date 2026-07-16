import type { LatLon, Vec2 } from './types'

const M_PER_DEG_LAT = 111320

export class Projector {
  private readonly lat0: number
  private readonly lon0: number
  private readonly mPerDegLon: number

  constructor(center: LatLon) {
    this.lat0 = center.lat
    this.lon0 = center.lon
    this.mPerDegLon = M_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180)
  }

  toLocal(p: LatLon): Vec2 {
    return {
      x: (p.lon - this.lon0) * this.mPerDegLon,
      z: -(p.lat - this.lat0) * M_PER_DEG_LAT,
    }
  }

  toLatLon(v: Vec2): LatLon {
    return {
      lat: this.lat0 - v.z / M_PER_DEG_LAT,
      lon: this.lon0 + v.x / this.mPerDegLon,
    }
  }
}
