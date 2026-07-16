import type { SpatialGrid } from '../physics/grid'
import { resolveCircle } from '../physics/collide'
import type { ElevationProvider } from '../terrain/provider'
import type { VehicleSpec } from './vehicles'

/** Car state. Velocity is a world-space vector (vx, vz) so the car can drift. */
export interface CarState {
  x: number
  z: number
  y: number
  heading: number
  vx: number
  vz: number
}
export interface CarInput {
  throttle: number
  steer: number
  brake: boolean
}

export function createCar(x = 0, z = 0): CarState {
  return { x, z, y: 0, heading: 0, vx: 0, vz: 0 }
}

/**
 * Arcade drift step. heading 0 faces +x; +heading rotates toward +z.
 * Steering rotates the heading; the velocity is then split into forward and
 * lateral components relative to the new heading. Forward gets engine/drag,
 * lateral gets tire grip — low grip lets the tail slide out (drift).
 */
export function stepCar(
  car: CarState,
  input: CarInput,
  dt: number,
  grid: SpatialGrid,
  provider: ElevationProvider,
  spec: VehicleSpec,
): CarState {
  // Forward speed relative to the current heading (for steering authority + sign).
  const fx0 = Math.cos(car.heading)
  const fz0 = Math.sin(car.heading)
  const vForward0 = car.vx * fx0 + car.vz * fz0

  // Steering: scaled by speed (can't spin when parked), reversed when backing up.
  const speedFactor = Math.min(1, Math.abs(vForward0) / spec.turnSpeedRef)
  const dir = vForward0 < 0 ? -1 : 1
  const heading = car.heading + input.steer * spec.turnRate * speedFactor * dir * dt

  // New heading basis: forward (fx,fz) and right/lateral (rx,rz).
  const fx = Math.cos(heading)
  const fz = Math.sin(heading)
  const rx = -fz
  const rz = fx

  let vF = car.vx * fx + car.vz * fz
  let vL = car.vx * rx + car.vz * rz

  // Engine + braking on the forward axis.
  vF += input.throttle * spec.accel * dt
  if (input.brake) {
    const b = spec.brakeAccel * dt
    vF = vF > 0 ? Math.max(0, vF - b) : Math.min(0, vF + b) // brake toward 0, never past it
  }
  vF *= Math.exp(-spec.dragForward * dt)
  if (Math.abs(vF) < 0.001) vF = 0
  vF = Math.max(-spec.maxReverse, Math.min(spec.maxSpeed, vF))

  // Tire grip on the lateral axis: slide decays; low grip = drift.
  vL *= Math.exp(-spec.gripLateral * dt)

  // Recompose world velocity and integrate position.
  let vx = vF * fx + vL * rx
  let vz = vF * fz + vL * rz
  const nx = car.x + vx * dt
  const nz = car.z + vz * dt

  const resolved = resolveCircle(nx, nz, spec.radius, grid)
  if (resolved.x !== nx || resolved.z !== nz) {
    vx *= 0.3 // bleed speed on impact
    vz *= 0.3
  }

  return {
    x: resolved.x,
    z: resolved.z,
    y: provider.heightAt(resolved.x, resolved.z),
    heading,
    vx,
    vz,
  }
}
