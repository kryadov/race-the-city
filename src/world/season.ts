/**
 * The world dresses for the date. Given a date and the city's latitude, this
 * hands back the palette the season paints onto the living scenery — the
 * grass/park ground, the tree crowns, spring blossom and winter snow.
 *
 * It is deliberately pure and THREE-free: colours are packed 0xRRGGBB integers
 * and the only maths is HSL. Two reasons. First, the Workflow sandbox has no
 * `Date`, so the date is a parameter (the app passes `new Date()`), and the unit
 * tests can pin the whole month -> season -> colour mapping without a clock.
 * Second, this is meant to outgrow the trees: snow cover, pedestrian clothing
 * and fireworks will all read the same `season(date, lat)`, so the shape carries
 * `grass`/`snow` that greenery itself only half-uses today.
 */

export type SeasonName = 'spring' | 'summer' | 'autumn' | 'winter'

export interface Season {
  name: SeasonName
  /** The colour a park/grass surface wears this season (packed 0xRRGGBB). The
   * ground mesh (built elsewhere, in ground.ts) tints its park vertices toward
   * this; greenery only grows the trees, but the palette lives in one place. */
  grass: number
  /**
   * The colour open pasture/meadow wears — the rough grassland the livestock
   * graze. Like {@link grass} but for `meadow` land-use, kept a touch brighter so
   * it still reads apart from a mown park. Summer equals ground.ts's meadow tint,
   * so summer is unchanged; the other seasons dull and brown it.
   */
  pasture: number
  /**
   * The colour cropland/farmland wears — tilled-green in spring, warm khaki in
   * summer (unchanged from ground.ts), golden at harvest in autumn, bare brown in
   * winter. For `farmland` land-use.
   */
  crop: number
  /**
   * Recolour a deciduous tree crown from its summer-green `base` to this
   * season's hue. `r` in [0,1) — drawn from the world's seeded RNG — spreads a
   * stand of trees across the season's range (autumn's yellow -> orange -> red),
   * so neighbouring crowns differ yet every reload of the same seed paints them
   * identically. Evergreens (conifer, spruce, palm) ignore this and stay green.
   */
  crown: (base: number, r: number) => number
  /** The colour of a blossoming spring crown (pale pink-white). */
  blossom: number
  /** 0..1 — the fraction of deciduous crowns wearing blossom (spring only). */
  blossomChance: number
  /** 0..1 — how thickly snow dusts crowns and ground (winter only). */
  snow: number
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)

/** Packed 0xRRGGBB -> HSL, each channel in [0,1). */
function hslOf(rgb: number): [number, number, number] {
  const r = ((rgb >> 16) & 255) / 255
  const g = ((rgb >> 8) & 255) / 255
  const b = (rgb & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l]
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [h / 6, s, l]
}

/** HSL (hue wrapped, sat/light clamped) -> packed 0xRRGGBB. */
function rgbOf(h: number, s: number, l: number): number {
  h = ((h % 1) + 1) % 1
  s = clamp01(s)
  l = clamp01(l)
  const a = s * Math.min(l, 1 - l)
  const chan = (n: number): number => {
    const k = (n + h * 12) % 12
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(c * 255)
  }
  return (chan(0) << 16) | (chan(8) << 8) | chan(4)
}

/**
 * The four palettes. Crowns are the interesting part:
 *  - summer keeps the base greens untouched — they were tuned as summer foliage;
 *  - spring lifts the same greens in saturation and lightness (young leaves);
 *  - autumn throws the green away and sweeps `r` across the warm arc, red (0.015)
 *    through orange to yellow (0.135), so a stand turns a mix of colours;
 *  - winter bleeds the green out to a pale grey-green — bare twigs under snow —
 *    keeping the base hue so it reads as *that* tree, drained.
 */
const SEASONS: Record<SeasonName, Season> = {
  spring: {
    name: 'spring',
    grass: 0x5c9a3f, // fresh, bright park green
    pasture: 0x8fc563, // young pasture, brighter than summer
    crop: 0x9fae63, // tilled ground greening with the first shoots
    crown: (base, r) => {
      const [h, s, l] = hslOf(base)
      return rgbOf(h + (r - 0.5) * 0.02, s + 0.12, l + 0.13)
    },
    blossom: 0xf3d9e6, // pale pink-white
    blossomChance: 0.35,
    snow: 0,
  },
  summer: {
    name: 'summer',
    grass: 0x4c7a42, // the ground mesh's default park green
    pasture: 0x83b25c, // == ground.ts SURFACE_COLORS.meadow — summer is unchanged
    crop: 0xbdaa6a, // == ground.ts SURFACE_COLORS.farmland — summer is unchanged
    crown: (base) => base,
    blossom: 0xf3d9e6,
    blossomChance: 0,
    snow: 0,
  },
  autumn: {
    name: 'autumn',
    grass: 0x7d7a45, // duller, drying ochre-green
    pasture: 0x9a9a55, // drying pasture, going to seed
    crop: 0xc9a24f, // golden stubble at harvest
    crown: (_base, r) => rgbOf(0.015 + r * 0.12, 0.72, 0.44),
    blossom: 0xf3d9e6,
    blossomChance: 0,
    snow: 0,
  },
  winter: {
    name: 'winter',
    grass: 0x6f7a68, // grey-green, frost-dulled
    pasture: 0x83836e, // frost-dulled grassland, grey-brown
    crop: 0x9c8d6e, // bare, ploughed brown earth
    crown: (base, r) => {
      const [h] = hslOf(base)
      return rgbOf(h, 0.1, 0.5 + (r - 0.5) * 0.04)
    },
    blossom: 0xf3d9e6,
    blossomChance: 0,
    snow: 0.6,
  },
}

/**
 * Meteorological seasons by month — whole calendar months, which is what a
 * colour palette wants and which line up with how a place actually *looks*.
 * Written from the northern hemisphere's point of view; south of the equator the
 * year is half a turn out of phase, so we shift the month by six.
 */
export function season(date: Date, lat: number): Season {
  const month = lat < 0 ? (date.getMonth() + 6) % 12 : date.getMonth()
  return SEASONS[nameOf(month)]
}

/** month 0-11 (already hemisphere-flipped) -> season name. */
function nameOf(month: number): SeasonName {
  if (month <= 1 || month === 11) return 'winter' // Dec, Jan, Feb
  if (month <= 4) return 'spring' // Mar, Apr, May
  if (month <= 7) return 'summer' // Jun, Jul, Aug
  return 'autumn' // Sep, Oct, Nov
}
