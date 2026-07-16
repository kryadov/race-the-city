/**
 * Driveable, well-mapped cities for the "Random city" button, grouped by region.
 *
 * The grouping is the point. A flat list picks in proportion to how many entries
 * each part of the world happens to have — and a hand-written list leans
 * European without anyone deciding it should, so Europe is all you ever get.
 * Drawing a region first and a city second gives every part of the world the
 * same turn, whatever its share of the list.
 */
export const CITY_REGIONS: readonly (readonly string[])[] = [
  // Western & Southern Europe
  [
    'Monte Carlo',
    'Amsterdam, Netherlands',
    'Barcelona, Spain',
    'Venice, Italy',
    'Lisbon, Portugal',
    'Edinburgh, Scotland',
    'Bruges, Belgium',
    'Florence, Italy',
    'Porto, Portugal',
    'Lyon, France',
  ],
  // Central, Northern & Eastern Europe
  [
    'Prague, Czechia',
    'Vienna, Austria',
    'Copenhagen, Denmark',
    'Dubrovnik, Croatia',
    'Reykjavik, Iceland',
    'Tallinn, Estonia',
    'Krakow, Poland',
    'Budapest, Hungary',
    'Helsinki, Finland',
  ],
  // Russia & the Caucasus
  [
    'Saint Petersburg, Russia',
    'Moscow, Russia',
    'Kazan, Russia',
    'Yekaterinburg, Russia',
    'Novosibirsk, Russia',
    'Vladivostok, Russia',
    'Sochi, Russia',
    'Tbilisi, Georgia',
    'Yerevan, Armenia',
    'Baku, Azerbaijan',
  ],
  // East Asia
  [
    'Kyoto, Japan',
    'Tokyo, Japan',
    'Osaka, Japan',
    'Sapporo, Japan',
    'Seoul, South Korea',
    'Busan, South Korea',
    'Shanghai, China',
    'Beijing, China',
    'Chengdu, China',
    'Hong Kong',
    'Taipei, Taiwan',
  ],
  // South & Southeast Asia
  [
    'Singapore',
    'Delhi, India',
    'Mumbai, India',
    'Bengaluru, India',
    'Jaipur, India',
    'Bangkok, Thailand',
    'Chiang Mai, Thailand',
    'Hanoi, Vietnam',
    'Kuala Lumpur, Malaysia',
    'Jakarta, Indonesia',
    'Colombo, Sri Lanka',
  ],
  // Middle East & Central Asia
  [
    'Istanbul, Turkey',
    'Dubai, United Arab Emirates',
    'Tel Aviv, Israel',
    'Amman, Jordan',
    'Tashkent, Uzbekistan',
    'Almaty, Kazakhstan',
    'Astana, Kazakhstan',
  ],
  // Africa
  [
    'Marrakesh, Morocco',
    'Cape Town, South Africa',
    'Cairo, Egypt',
    'Nairobi, Kenya',
    'Accra, Ghana',
    'Tunis, Tunisia',
    'Johannesburg, South Africa',
  ],
  // North America
  [
    'San Francisco, USA',
    'New York, USA',
    'Chicago, USA',
    'Seattle, USA',
    'Boston, USA',
    'Montreal, Canada',
    'Vancouver, Canada',
    'Mexico City, Mexico',
  ],
  // Latin America
  [
    'Buenos Aires, Argentina',
    'Rio de Janeiro, Brazil',
    'Sao Paulo, Brazil',
    'Santiago, Chile',
    'Bogota, Colombia',
    'Lima, Peru',
    'Montevideo, Uruguay',
    'Havana, Cuba',
  ],
  // Oceania
  ['Sydney, Australia', 'Melbourne, Australia', 'Auckland, New Zealand', 'Wellington, New Zealand'],
]

/** Every city, flat — for anything that just wants the names. */
export const RANDOM_CITIES: readonly string[] = CITY_REGIONS.flat()

/**
 * A random city, different from `avoid` when possible.
 *
 * Picks a region first, so the world gets an even turn instead of wherever the
 * list happens to be longest.
 */
export function pickRandomCity(avoid?: string, rand: () => number = Math.random): string {
  for (let tries = 0; tries < 12; tries++) {
    const region = CITY_REGIONS[Math.floor(rand() * CITY_REGIONS.length)]
    const city = region[Math.floor(rand() * region.length)]
    if (city !== avoid) return city
  }
  // Every draw came back as the city we're already in: take anything else.
  const rest = RANDOM_CITIES.filter((c) => c !== avoid)
  return rest.length ? rest[Math.floor(rand() * rest.length)] : RANDOM_CITIES[0]
}
