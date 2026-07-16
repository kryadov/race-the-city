import type { Vec2 } from '../geo/types'

/** Uniform grid indexing polygon footprints by the cells their bbox overlaps. */
export class SpatialGrid {
  private readonly cell: number
  private readonly buckets = new Map<string, Vec2[][]>()

  constructor(footprints: Vec2[][], cellSize = 25) {
    this.cell = cellSize
    for (const fp of footprints) this.insert(fp)
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
