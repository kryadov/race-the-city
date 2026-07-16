export type VehicleType = 'car' | 'truck' | 'sports'

export const VEHICLE_TYPES: readonly VehicleType[] = ['car', 'truck', 'sports']

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
}
