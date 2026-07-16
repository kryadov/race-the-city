import type { ElevationProvider } from './provider'

/**
 * Snap an elevation source onto the ground mesh's own grid.
 *
 * The ground is drawn as a fixed grid — 12.5m cells at the default resolution —
 * and the GPU stretches a flat triangle between its corners. Sampling the raw
 * DEM instead gives a *different* surface between those corners, because the DEM
 * has detail far finer than a cell. The car then drives on a surface nobody can
 * see: in a dip it sinks into the visible ground up to its windows, on a crest
 * it hovers. Which of the two, and by how much, depends on the terrain — hence
 * "sometimes, and it's not clear why".
 *
 * This resamples at exactly the mesh's nodes and interpolates between them, so
 * heightAt returns the surface actually on screen. Feed it to everything that
 * sits on the ground and they all agree.
 *
 * @param halfSize same half-extent the ground mesh is built with
 * @param segments same segment count the ground mesh is built with
 */
export function griddedProvider(
  src: ElevationProvider,
  halfSize: number,
  segments: number,
): ElevationProvider {
  const step = (halfSize * 2) / segments
  const n = segments + 1
  const h = new Float32Array(n * n)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      h[j * n + i] = src.heightAt(-halfSize + i * step, -halfSize + j * step)
    }
  }

  const node = (i: number, j: number): number => {
    const ci = i < 0 ? 0 : i > n - 1 ? n - 1 : i
    const cj = j < 0 ? 0 : j > n - 1 ? n - 1 : j
    return h[cj * n + ci]
  }

  return {
    heightAt(x: number, z: number): number {
      const gx = (x + halfSize) / step
      const gz = (z + halfSize) / step
      const i = Math.floor(gx)
      const j = Math.floor(gz)
      const fx = gx - i
      const fz = gz - j
      const a = node(i, j) * (1 - fx) + node(i + 1, j) * fx
      const b = node(i, j + 1) * (1 - fx) + node(i + 1, j + 1) * fx
      return a * (1 - fz) + b * fz
    },
  }
}
