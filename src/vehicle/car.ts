import type { SpatialGrid } from '../physics/grid'
import { resolveCircle } from '../physics/collide'
import type { ElevationProvider } from '../terrain/provider'

export interface CarState { x: number; z: number; y: number; heading: number; speed: number }
export interface CarInput { throttle: number; steer: number; brake: boolean }

const ACCEL = 90 // m/s^2 at full throttle — punchy pickup
const BRAKE = 60
const FRICTION = 3.3 // per second velocity decay; terminal speed ≈ ACCEL/FRICTION ≈ 27 m/s (~98 km/h)
const MAX_SPEED = 60
const TURN_RATE = 2.2 // rad/s at full steer and full speed — responsive steering
const CAR_RADIUS = 2

export function createCar(x = 0, z = 0): CarState {
  return { x, z, y: 0, heading: 0, speed: 0 }
}

/** heading 0 faces +x; +heading rotates toward +z. */
export function stepCar(
  car: CarState,
  input: CarInput,
  dt: number,
  grid: SpatialGrid,
  provider: ElevationProvider,
): CarState {
  let speed = car.speed
  speed += input.throttle * ACCEL * dt
  if (input.brake) speed -= Math.sign(speed) * BRAKE * dt
  speed *= Math.exp(-FRICTION * dt) // friction/drag (unconditionally stable exponential decay)
  speed = Math.max(-MAX_SPEED / 2, Math.min(MAX_SPEED, speed))
  if (Math.abs(speed) < 0.001) speed = 0

  // steering scales with speed so a parked car can't spin
  const speedFactor = Math.min(1, Math.abs(speed) / 10)
  const heading = car.heading + input.steer * TURN_RATE * speedFactor * Math.sign(speed || 1) * dt

  const nx = car.x + Math.cos(heading) * speed * dt
  const nz = car.z + Math.sin(heading) * speed * dt

  const resolved = resolveCircle(nx, nz, CAR_RADIUS, grid)
  const hitWall = resolved.x !== nx || resolved.z !== nz
  if (hitWall) speed *= 0.3 // bleed speed on impact

  return {
    x: resolved.x,
    z: resolved.z,
    y: provider.heightAt(resolved.x, resolved.z),
    heading,
    speed,
  }
}
