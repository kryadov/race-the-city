/** A curated set of driveable, well-mapped cities for the "Random city" button. */
export const RANDOM_CITIES: readonly string[] = [
  'Monte Carlo',
  'Amsterdam, Netherlands',
  'Barcelona, Spain',
  'Venice, Italy',
  'Kyoto, Japan',
  'San Francisco, USA',
  'Prague, Czechia',
  'Lisbon, Portugal',
  'Edinburgh, Scotland',
  'Vienna, Austria',
  'Copenhagen, Denmark',
  'Dubrovnik, Croatia',
  'Bruges, Belgium',
  'Reykjavik, Iceland',
  'Tallinn, Estonia',
  'Porto, Portugal',
  'Florence, Italy',
  'Istanbul, Turkey',
  'Marrakesh, Morocco',
  'Singapore',
  'Sydney, Australia',
  'Cape Town, South Africa',
  'Buenos Aires, Argentina',
  'Rio de Janeiro, Brazil',
  'Tbilisi, Georgia',
]

/** A random city different from `avoid` when possible. */
export function pickRandomCity(avoid?: string): string {
  const pool = RANDOM_CITIES.filter((c) => c !== avoid)
  const list = pool.length ? pool : RANDOM_CITIES
  return list[Math.floor(Math.random() * list.length)]
}
