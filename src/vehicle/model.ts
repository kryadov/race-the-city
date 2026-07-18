import * as THREE from 'three'
import type { VehicleType } from './vehicles'
import { buildCar, buildSports, buildRaceCar, buildCabrio, buildRetro, buildEv, buildMinivan, buildJeep, buildPickup, buildPolice } from './models/cars'
import { buildTruck, buildBus, buildLorry, buildTanker, buildAmbulance, buildFiretruck } from './models/trucks'
import { buildTractor, buildCrane, buildRoller, buildCombine, buildTiller } from './models/special'
import { buildMotorbike, buildTracked, buildHover } from './models/exotic'
import { REAR_LIGHT_MAT } from './models/parts'

export {
  REAR_LIGHT_MAT, TURN_LEFT_MAT, TURN_RIGHT_MAT, REAR_LIGHT_IDLE, REAR_LIGHT_BRAKE,
} from './models/parts'

// Per-vehicle stop-light colour so the cluster reads as part of the car's style.
const STOP_STYLE: Record<VehicleType, { color: number; emissive: number }> = {
  car: { color: 0x5a0000, emissive: 0xff1400 }, // classic red
  truck: { color: 0x5a1e00, emissive: 0xff5a00 }, // amber-red
  sports: { color: 0x4a0022, emissive: 0xff0055 }, // magenta LED
  motorbike: { color: 0x5a0000, emissive: 0xff2a00 },
  bus: { color: 0x5a1200, emissive: 0xff4400 },
  racecar: { color: 0x4a0010, emissive: 0xff0033 }, // single bright rain light
  tractor: { color: 0x5a2400, emissive: 0xff6a00 },
  lorry: { color: 0x5a1e00, emissive: 0xff5a00 },
  cabrio: { color: 0x50002a, emissive: 0xff1466 },
  retro: { color: 0x5a0e00, emissive: 0xff3c00 }, // warm orange-red
  ev: { color: 0x3a0030, emissive: 0xff2eb0 }, // pink LED bar
  minivan: { color: 0x5a0018, emissive: 0xff1a3c },
  jeep: { color: 0x4a2400, emissive: 0xff8a1e }, // amber, off-road-yellow tail lamps
  pickup: { color: 0x5a1400, emissive: 0xff4c00 }, // warm truck-orange
  police: { color: 0x4a0010, emissive: 0xff0033 }, // sharp red, to match the bar
  tanker: { color: 0x5a1e00, emissive: 0xff5a00 },
  ambulance: { color: 0x5a0010, emissive: 0xff2030 }, // clinical red
  firetruck: { color: 0x5a0800, emissive: 0xff2a00 }, // deep engine-red
  crane: { color: 0x5a2400, emissive: 0xff6a00 },
  roller: { color: 0x5a2400, emissive: 0xff6a00 },
  combine: { color: 0x5a2400, emissive: 0xff6a00 },
  tiller: { color: 0x5a0e00, emissive: 0xff3c00 },
  tracked: { color: 0x3a2400, emissive: 0xff7a00 },
  hover: { color: 0x003a4a, emissive: 0x00e5ff },
}

const BUILDERS: Record<VehicleType, () => THREE.Group> = {
  car: buildCar,
  truck: buildTruck,
  sports: buildSports,
  motorbike: buildMotorbike,
  bus: buildBus,
  racecar: buildRaceCar,
  tractor: buildTractor,
  lorry: buildLorry,
  cabrio: buildCabrio,
  retro: buildRetro,
  ev: buildEv,
  minivan: buildMinivan,
  jeep: buildJeep,
  pickup: buildPickup,
  police: buildPolice,
  tanker: buildTanker,
  ambulance: buildAmbulance,
  firetruck: buildFiretruck,
  crane: buildCrane,
  roller: buildRoller,
  combine: buildCombine,
  tiller: buildTiller,
  tracked: buildTracked,
  hover: buildHover,
}

export function buildVehicleMesh(type: VehicleType): THREE.Group {
  const s = STOP_STYLE[type] // tint the shared stop material to match this vehicle
  REAR_LIGHT_MAT.color.setHex(s.color)
  REAR_LIGHT_MAT.emissive.setHex(s.emissive)
  return BUILDERS[type]()
}

/** Where a vehicle's rear tyres are, and how wide they are — in model space. */
export interface WheelPrint {
  /** Tyre width, metres: how wide a skid mark it lays. */
  width: number
  /** Half the rear track: the offset either side of the centreline. */
  track: number
  /** How far behind the middle the rear axle sits. */
  rear: number
}

/**
 * Measure a built model's rear wheels.
 *
 * Read off the model rather than kept in a table beside it: the wheels are built
 * with a radius and a width already, and a second copy of those numbers is a
 * second thing to forget when a model changes. Null when the thing has no
 * wheels — a hovercraft leaves no tyre marks, having no tyres.
 */
export function wheelPrint(mesh: THREE.Object3D): WheelPrint | null {
  mesh.updateMatrixWorld(true)
  const wheels: { x: number; z: number; width: number }[] = []
  const at = new THREE.Vector3()
  mesh.traverse((o) => {
    const d = o.userData as { wheelRadius?: number; wheelWidth?: number }
    if (!d.wheelRadius) return
    o.getWorldPosition(at)
    wheels.push({ x: at.x, z: at.z, width: d.wheelWidth ?? d.wheelRadius })
  })
  if (!wheels.length) return null

  // The rearmost axle is the one that marks: the model's nose is its local +x,
  // so that is the smallest x. Anything within half a metre of it is the same
  // axle — a twin-tyred truck has two wheels a side, not two axles.
  const back = Math.min(...wheels.map((w) => w.x))
  const axle = wheels.filter((w) => w.x <= back + 0.5)
  return {
    width: Math.max(...axle.map((w) => w.width)),
    track: Math.max(...axle.map((w) => Math.abs(w.z))),
    rear: -back,
  }
}
