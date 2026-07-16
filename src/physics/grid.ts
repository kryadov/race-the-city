import type { Vec2 } from '../geo/types'

/** Uniform grid indexing polygon footprints by the cells their bbox overlaps. */
export class SpatialGrid {
  private readonly cell: number
  private readonly buckets = new Map<string, Vec2[][]>()
  private readonly tops = new Map<Vec2[], number>()

  /**
   * @param tops how high each footprint stands, in absolute metres, parallel to
   *   `footprints`. Anything left out is treated as reaching the sky and is
   *   never flown over — an obstacle of unknown height is not one to gamble a
   *   car on.
   */
  constructor(footprints: Vec2[][], cellSize = 25, tops: number[] = []) {
    this.cell = cellSize
    footprints.forEach((fp, i) => {
      this.insert(fp)
      if (tops[i] !== undefined) this.tops.set(fp, tops[i])
    })
  }

  /** The height of a footprint's top, or Infinity if nobody said. */
  topOf(fp: Vec2[]): number {
    return this.tops.get(fp) ?? Infinity
  }

  private key(cx: number, cz: number): string {
    return `${cx},${cz}`
  }

  private insert(fp: Vec2[]): void {
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity
    for (const p of fp) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.z < minZ) minZ = p.z
      if (p.z > maxZ) maxZ = p.z
    }
    for (let cx = Math.floor(minX / this.cell); cx <= Math.floor(maxX / this.cell); cx++) {
      for (let cz = Math.floor(minZ / this.cell); cz <= Math.floor(maxZ / this.cell); cz++) {
        const k = this.key(cx, cz)
        const bucket = this.buckets.get(k) ?? []
        bucket.push(fp)
        this.buckets.set(k, bucket)
      }
    }
  }

  /** Footprints in the query cell and its 8 neighbors, de-duplicated. */
  near(x: number, z: number): Vec2[][] {
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell)
    const seen = new Set<Vec2[]>()
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const bucket = this.buckets.get(this.key(cx + dx, cz + dz))
        if (bucket) for (const fp of bucket) seen.add(fp)
      }
    }
    return [...seen]
  }
}
