export type VehicleType = 'car' | 'truck' | 'sports' | 'motorbike' | 'bus' | 'racecar' | 'tractor' | 'lorry' | 'cabrio'

export const VEHICLE_TYPES: readonly VehicleType[] = [
  'car',
  'sports',
  'racecar',
  'motorbike',
  'cabrio',
  'truck',
  'lorry',
  'bus',
  'tractor',
]

/**
 * Menu grouping, by what the thing is for. The picker renders these in order and
 * never names a vehicle itself, so adding a type is one line here.
 */
export const VEHICLE_GROUPS: readonly { key: string; types: readonly VehicleType[] }[] = [
  { key: 'vehGroup.cars', types: ['car', 'sports', 'racecar', 'cabrio'] },
  { key: 'vehGroup.trucks', types: ['truck', 'lorry', 'bus'] },
  { key: 'vehGroup.special', types: ['tractor'] },
  { key: 'vehGroup.exotic', types: ['motorbike'] },
]

/** Vehicles that bank into corners (only the bike leans). */
export const LEANS: Partial<Record<VehicleType, boolean>> = { motorbike: true }

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
}
