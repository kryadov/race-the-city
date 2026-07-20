export type VehicleType =
  | 'car' | 'truck' | 'sports' | 'motorbike' | 'bus' | 'racecar' | 'tractor' | 'lorry' | 'cabrio'
  | 'retro' | 'ev' | 'minivan' | 'jeep' | 'pickup' | 'police' | 'tanker' | 'ambulance' | 'firetruck'
  | 'crane' | 'roller' | 'combine' | 'tiller'
  | 'tracked' | 'hover'

export const VEHICLE_TYPES: readonly VehicleType[] = [
  'car',
  'sports',
  'racecar',
  'motorbike',
  'cabrio',
  'retro',
  'ev',
  'minivan',
  'jeep',
  'pickup',
  'police',
  'truck',
  'lorry',
  'tanker',
  'bus',
  'ambulance',
  'firetruck',
  'tractor',
  'crane',
  'roller',
  'combine',
  'tiller',
  'tracked',
  'hover',
]

/**
 * Menu grouping, by what the thing is for. The picker renders these in order and
 * never names a vehicle itself, so adding a type is one line here.
 */
export const VEHICLE_GROUPS: readonly { key: string; types: readonly VehicleType[] }[] = [
  { key: 'vehGroup.cars', types: ['car', 'sports', 'racecar', 'cabrio', 'retro', 'ev', 'minivan', 'jeep', 'pickup', 'police'] },
  { key: 'vehGroup.trucks', types: ['truck', 'lorry', 'bus', 'tanker', 'ambulance', 'firetruck'] },
  { key: 'vehGroup.special', types: ['tractor', 'crane', 'roller', 'combine', 'tiller'] },
  { key: 'vehGroup.exotic', types: ['motorbike', 'tracked', 'hover'] },
]

/** Vehicles that bank into corners (only the bike leans). */
export const LEANS: Partial<Record<VehicleType, boolean>> = { motorbike: true }

/** Vehicles with no wheels that float above the ground. */
export const HOVERS: Partial<Record<VehicleType, boolean>> = { hover: true }

/** How high a hovering vehicle floats above the terrain, in metres. */
export const HOVER_H = 1.0

/**
 * How thirsty each vehicle is, as a multiple of a plain car's fuel burn. Heavy
 * haulers and big engines drink hard; an electric/hover sips. Anything not listed
 * (the car itself, and the rest) burns at the reference rate of 1 — see {@link thirstOf}.
 */
export const THIRST: Partial<Record<VehicleType, number>> = {
  truck: 1.7,
  lorry: 1.8,
  tanker: 1.9,
  bus: 1.6,
  firetruck: 1.9,
  ambulance: 1.4,
  tractor: 1.6,
  crane: 1.8,
  roller: 1.6,
  combine: 1.7,
  tiller: 1.4,
  tracked: 1.8,
  sports: 1.3,
  racecar: 1.5,
  cabrio: 1.1,
  retro: 1.2,
  minivan: 1.15,
  jeep: 1.3,
  pickup: 1.3,
  police: 1.2,
  motorbike: 0.55,
  ev: 0.5,
  hover: 0.6,
}

/** Fuel burn multiplier for a vehicle type; 1 (a plain car) for anything unlisted. */
export function thirstOf(type: VehicleType): number {
  return THIRST[type] ?? 1
}

export interface VehicleSpec {
  key: VehicleType
  accel: number // forward acceleration, m/s^2 at full throttle
  brakeAccel: number // braking deceleration, m/s^2
  dragForward: number // forward drag coeff (exp decay per second)
  gripLateral: number // lateral grip coeff (exp decay); higher = less drift
  turnRate: number // rad/s at full steer and reference speed
  turnSpeedRef: number // forward speed (m/s) for full steering authority
  maxSpeed: number // forward speed cap, m/s
  maxReverse: number // reverse speed cap, m/s
  radius: number // collision circle radius, m
}

/**
 * Handling presets. Same arcade model, different personalities:
 * car = nimble and grippy; truck = heavy, sluggish, slides more; sports =
 * very fast and eager, drifts a touch easier than the car.
 */
export const VEHICLES: Record<VehicleType, VehicleSpec> = {
  car: {
    key: 'car',
    accel: 80,
    brakeAccel: 70,
    dragForward: 2.0,
    gripLateral: 7,
    turnRate: 2.4,
    turnSpeedRef: 8,
    maxSpeed: 42,
    maxReverse: 14,
    radius: 1.3,
  },
  truck: {
    key: 'truck',
    accel: 42,
    brakeAccel: 50,
    dragForward: 1.5,
    gripLateral: 3.5,
    turnRate: 1.3,
    turnSpeedRef: 11,
    maxSpeed: 30,
    maxReverse: 9,
    radius: 2,
  },
  sports: {
    key: 'sports',
    accel: 120,
    brakeAccel: 85,
    dragForward: 2.2,
    gripLateral: 6,
    turnRate: 2.8,
    turnSpeedRef: 7,
    maxSpeed: 55,
    maxReverse: 16,
    radius: 1.2,
  },
  // A bike: quick and flickable, grips hard (it leans instead of sliding).
  motorbike: {
    key: 'motorbike',
    accel: 105,
    brakeAccel: 78,
    dragForward: 2.1,
    gripLateral: 8.5,
    turnRate: 3.1,
    turnSpeedRef: 6.5,
    maxSpeed: 50,
    maxReverse: 8,
    radius: 0.8,
  },
  // A city bus: long, heavy, lazy steering.
  bus: {
    key: 'bus',
    accel: 34,
    brakeAccel: 45,
    dragForward: 1.4,
    gripLateral: 3.2,
    turnRate: 1.05,
    turnSpeedRef: 12,
    maxSpeed: 26,
    maxReverse: 8,
    radius: 2.2,
  },
  // Formula-style: the fastest and sharpest thing here.
  racecar: {
    key: 'racecar',
    accel: 145,
    brakeAccel: 95,
    dragForward: 2.4,
    gripLateral: 7.5,
    turnRate: 3.0,
    turnSpeedRef: 6.5,
    maxSpeed: 65,
    maxReverse: 15,
    radius: 1.1,
  },
  // A tractor: crawls, but turns tight.
  tractor: {
    key: 'tractor',
    accel: 26,
    brakeAccel: 40,
    dragForward: 1.2,
    gripLateral: 4,
    turnRate: 1.7,
    turnSpeedRef: 5,
    maxSpeed: 14,
    maxReverse: 6,
    radius: 1.5,
  },
  // An articulated lorry: the heaviest, slides the most.
  lorry: {
    key: 'lorry',
    accel: 36,
    brakeAccel: 46,
    dragForward: 1.5,
    gripLateral: 2.8,
    turnRate: 0.95,
    turnSpeedRef: 12,
    maxSpeed: 28,
    maxReverse: 8,
    radius: 2.4,
  },
  // An open-top cruiser: like the car, a touch faster and looser.
  cabrio: {
    key: 'cabrio',
    accel: 95,
    brakeAccel: 74,
    dragForward: 2.1,
    gripLateral: 6.4,
    turnRate: 2.6,
    turnSpeedRef: 7.5,
    maxSpeed: 48,
    maxReverse: 14,
    radius: 1.25,
  },
  // A 60s cruiser: soft springs, weak brakes, slides if you push it.
  retro: {
    key: 'retro', accel: 60, brakeAccel: 52, dragForward: 2.0, gripLateral: 4.6,
    turnRate: 2.2, turnSpeedRef: 8, maxSpeed: 34, maxReverse: 11, radius: 1.35,
  },
  // Electric: instant torque off the line, modest top end, grips well.
  ev: {
    key: 'ev', accel: 130, brakeAccel: 80, dragForward: 2.0, gripLateral: 7.2,
    turnRate: 2.5, turnSpeedRef: 7.5, maxSpeed: 44, maxReverse: 14, radius: 1.3,
  },
  // A people carrier: tall, unhurried, safe.
  minivan: {
    key: 'minivan', accel: 62, brakeAccel: 60, dragForward: 1.9, gripLateral: 5.5,
    turnRate: 2.0, turnSpeedRef: 9, maxSpeed: 36, maxReverse: 12, radius: 1.6,
  },
  // An off-roader: heavier and less eager than the car (accel/radius between car
  // and truck), but 4x4 grip close to the car's and a top speed that stays high
  // instead of falling off like the truck/minivan — it just gets there unhurried.
  jeep: {
    key: 'jeep', accel: 58, brakeAccel: 62, dragForward: 1.8, gripLateral: 6.3,
    turnRate: 2.0, turnSpeedRef: 8.5, maxSpeed: 40, maxReverse: 13, radius: 1.5,
  },
  // A pickup: a working truck's weight on a car's footprint — unhurried but not
  // sluggish, with the loose tail an empty bed gives it.
  pickup: {
    key: 'pickup', accel: 56, brakeAccel: 58, dragForward: 1.9, gripLateral: 5.6,
    turnRate: 2.0, turnSpeedRef: 8.5, maxSpeed: 38, maxReverse: 12, radius: 1.5,
  },
  // A police interceptor: nearly the sports car's pace, and grippy with it.
  police: {
    key: 'police', accel: 112, brakeAccel: 84, dragForward: 2.1, gripLateral: 7,
    turnRate: 2.7, turnSpeedRef: 7.5, maxSpeed: 52, maxReverse: 15, radius: 1.3,
  },
  // A fuel tanker: the sloshing load makes it the loosest heavy thing here.
  tanker: {
    key: 'tanker', accel: 34, brakeAccel: 44, dragForward: 1.5, gripLateral: 2.6,
    turnRate: 0.9, turnSpeedRef: 12, maxSpeed: 27, maxReverse: 8, radius: 2.4,
  },
  // An ambulance: a tall van that hustles — quicker than it looks, but it leans
  // on its brakes and its height keeps the grip modest.
  ambulance: {
    key: 'ambulance', accel: 60, brakeAccel: 64, dragForward: 1.8, gripLateral: 5.0,
    turnRate: 1.8, turnSpeedRef: 9.5, maxSpeed: 37, maxReverse: 11, radius: 1.7,
  },
  // A fire engine: heavy kit on board, so it sits between the truck and the
  // lorry — it gets there, in its own time.
  firetruck: {
    key: 'firetruck', accel: 40, brakeAccel: 52, dragForward: 1.5, gripLateral: 3.3,
    turnRate: 1.2, turnSpeedRef: 11.5, maxSpeed: 28, maxReverse: 9, radius: 2.2,
  },
  // A mobile crane: long, top-heavy, hauls itself around at a walking pace.
  crane: {
    key: 'crane', accel: 30, brakeAccel: 42, dragForward: 1.4, gripLateral: 3.0,
    turnRate: 1.0, turnSpeedRef: 12, maxSpeed: 22, maxReverse: 7, radius: 2.3,
  },
  // A road roller: barely moves, stops on a coin.
  roller: {
    key: 'roller', accel: 20, brakeAccel: 38, dragForward: 1.3, gripLateral: 5,
    turnRate: 1.2, turnSpeedRef: 5, maxSpeed: 10, maxReverse: 5, radius: 1.8,
  },
  // A combine harvester: big, slow, surprisingly tidy through a bend.
  combine: {
    key: 'combine', accel: 24, brakeAccel: 38, dragForward: 1.3, gripLateral: 3.8,
    turnRate: 1.5, turnSpeedRef: 6, maxSpeed: 13, maxReverse: 6, radius: 2.2,
  },
  // A tiller and its trailer: slow, narrow, spins on the spot. The radius is
  // half its width — the rig is long, so like the lorry it may clip lengthwise.
  tiller: {
    key: 'tiller', accel: 22, brakeAccel: 30, dragForward: 1.6, gripLateral: 6,
    turnRate: 2.6, turnSpeedRef: 3, maxSpeed: 8, maxReverse: 4, radius: 0.6,
  },
  // Tracks bite: it crawls, but it will not slide out from under you.
  tracked: {
    key: 'tracked', accel: 40, brakeAccel: 55, dragForward: 1.6, gripLateral: 11,
    turnRate: 1.4, turnSpeedRef: 6, maxSpeed: 18, maxReverse: 8, radius: 1.7,
  },
  // No wheels, no grip: it floats, so it slides through bends and coasts on the brakes.
  hover: {
    key: 'hover', accel: 85, brakeAccel: 40, dragForward: 1.6, gripLateral: 1.2,
    turnRate: 2.6, turnSpeedRef: 6, maxSpeed: 46, maxReverse: 14, radius: 1.3,
  },
}
