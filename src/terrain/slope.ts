import * as THREE from 'three'
import type { ElevationProvider } from './provider'

/** How far either side to sample the ground, in metres, to read its slope. */
const STEP = 2

const nUp = new THREE.Vector3()
const nFwd0 = new THREE.Vector3()
const nRight = new THREE.Vector3()
const nFwd = new THREE.Vector3()
const basis = new THREE.Matrix4()

/**
 * The attitude of something sitting on the ground here, facing `heading`.
 *
 * Not a yaw. A yaw alone holds a vehicle dead level and it slides down a hill
 * flat, like a lift, which is what the traffic did. The ground's slope is read
 * from the height either side and the model is stood on it: pitched into the
 * climb, banked on a side-slope.
 *
 * Writes into `out` and returns it — this runs per vehicle per frame, and a
 * fresh quaternion each time is garbage for the collector.
 *
 * @param heading radians; 0 faces +x, and +heading turns toward +z
 * @param level for something that floats and never pitches, whatever it is over
 */
export function groundQuat(
  out: THREE.Quaternion,
  x: number,
  z: number,
  heading: number,
  provider: ElevationProvider,
  level = false,
): THREE.Quaternion {
  if (level) nUp.set(0, 1, 0)
  else {
    const dHx = provider.heightAt(x + STEP, z) - provider.heightAt(x - STEP, z)
    const dHz = provider.heightAt(x, z + STEP) - provider.heightAt(x, z - STEP)
    nUp.set(-dHx / (2 * STEP), 1, -dHz / (2 * STEP)).normalize()
  }
  nFwd0.set(Math.cos(heading), 0, Math.sin(heading))
  nRight.crossVectors(nFwd0, nUp).normalize()
  nFwd.crossVectors(nUp, nRight).normalize()
  // Local +x is the model's nose and local +z its right: the convention every
  // vehicle model in the game is built to.
  basis.makeBasis(nFwd, nUp, nRight)
  return out.setFromRotationMatrix(basis)
}
