/**
 * The world seed: what makes two players' cities match.
 *
 * Every world factory in `main.ts` already takes a `rand` parameter, so sharing a
 * world is a matter of handing them a seeded generator instead of `Math.random`.
 * The catch is that a single shared generator couples the layers: if one player
 * runs a denser traffic setting, that layer draws more numbers and every layer
 * after it shifts. So each layer gets its OWN stream, derived from the seed and
 * the layer's name — draw counts in one can never move another.
 */

/** Deterministic PRNG — the same one `greenery`, `boats`, `crops` and `carPickups` use. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** FNV-1a over the layer name, mixed with the seed. */
function derive(seed: number, name: string): number {
  let h = (0x811c9dc5 ^ seed) >>> 0
  for (let i = 0; i < name.length; i++) {
    h = (h ^ name.charCodeAt(i)) >>> 0
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** A generator for one world layer — independent of every other layer's draws. */
export function stream(seed: number, name: string): () => number {
  return mulberry32(derive(seed, name))
}

/** A fresh seed for a solo session. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0x100000000) >>> 0
}
