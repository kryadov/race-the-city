import * as THREE from 'three'
import type { VehicleType } from './vehicles'
import { buildCar, buildSports, buildRaceCar, buildCabrio, buildRetro, buildEv, buildMinivan } from './models/cars'
import { buildTruck, buildBus, buildLorry, buildTanker } from './models/trucks'
import { buildTractor, buildCrane, buildRoller, buildCombine, buildTiller } from './models/special'
import { buildMotorbike } from './models/exotic'
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
  tanker: { color: 0x5a1e00, emissive: 0xff5a00 },
  crane: { color: 0x5a2400, emissive: 0xff6a00 },
  roller: { color: 0x5a2400, emissive: 0xff6a00 },
  combine: { color: 0x5a2400, emissive: 0xff6a00 },
  tiller: { color: 0x5a0e00, emissive: 0xff3c00 },
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
  tanker: buildTanker,
  crane: buildCrane,
  roller: buildRoller,
  combine: buildCombine,
  tiller: buildTiller,
}

export function buildVehicleMesh(type: VehicleType): THREE.Group {
  const s = STOP_STYLE[type] // tint the shared stop material to match this vehicle
  REAR_LIGHT_MAT.color.setHex(s.color)
  REAR_LIGHT_MAT.emissive.setHex(s.emissive)
  return BUILDERS[type]()
}
