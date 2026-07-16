import * as THREE from 'three'

const CRUISE_Y = 420 // altitude, metres
const SPAN = 3000 // how far out they enter and leave
const SPEED = 95 // m/s
const GAP_MIN = 25 // seconds between arrivals
const GAP_MAX = 70
const SCALE = 9 // airliners are far away; draw them oversized to read at all

export interface Planes {
  update(dt: number, camX: number, camZ: number, night: number): void
  setEnabled(on: boolean): void
}

/** An airliner shape, pointing +x. */
function airframe(): THREE.Group {
  const g = new THREE.Group()
  const body = new THREE.MeshStandardMaterial({ color: 0xe8ecf2, flatShading: true })
  const fuselage = new THREE.CylinderGeometry(0.9, 0.55, 12, 7)
  fuselage.rotateZ(Math.PI / 2)
  g.add(new THREE.Mesh(fuselage, body))
  const wing = new THREE.BoxGeometry(2.6, 0.24, 13)
  g.add(new THREE.Mesh(wing, body))
  const tail = new THREE.BoxGeometry(1.6, 0.2, 5)
  tail.translate(-5, 0, 0)
  g.add(new THREE.Mesh(tail, body))
  const fin = new THREE.BoxGeometry(1.6, 2.6, 0.2)
  fin.translate(-5, 1.3, 0)
  g.add(new THREE.Mesh(fin, body))
  g.scale.setScalar(SCALE)
  return g
}

/** The contrail: a long thin ribbon fading out behind. */
function trail(): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(SPAN * 0.35, 6)
  geo.rotateX(-Math.PI / 2)
  geo.translate(-SPAN * 0.175, 0, 0) // stretch back from the tail
  return new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, depthWrite: false }),
  )
}

/**
 * The odd airliner crossing overhead.
 *
 * One plane at a time, on a straight line at a fixed altitude — it is scenery,
 * five hundred metres up, and nobody is going to check its flight plan. It is
 * drawn oversized because a real airliner at that range is a couple of pixels.
 */
export function createPlanes(scene: THREE.Scene, rand: () => number = Math.random): Planes {
  const group = new THREE.Group()
  const plane = airframe()
  plane.add(trail())
  group.add(plane)
  group.visible = false
  scene.add(group)

  let wait = GAP_MIN + rand() * (GAP_MAX - GAP_MIN)
  let flying = false
  let t = 0
  let heading = 0
  let originX = 0
  let originZ = 0
  const nav = new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff2200, emissiveIntensity: 0 })
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5), nav)
  lamp.position.set(0, 0, 6.6)
  plane.add(lamp)

  return {
    setEnabled(on) {
      if (!on) {
        flying = false
        group.visible = false
      }
    },
    update(dt, camX, camZ, night) {
      if (!flying) {
        wait -= dt
        if (wait > 0) return
        // Launch a new one on a random bearing, passing near the player.
        heading = rand() * Math.PI * 2
        const offset = (rand() - 0.5) * 1200 // how wide of us it passes
        originX = camX - Math.cos(heading) * SPAN * 0.5 - Math.sin(heading) * offset
        originZ = camZ - Math.sin(heading) * SPAN * 0.5 + Math.cos(heading) * offset
        t = 0
        flying = true
        group.visible = true
      }

      t += dt
      const d = t * SPEED
      if (d > SPAN) {
        flying = false
        group.visible = false
        wait = GAP_MIN + rand() * (GAP_MAX - GAP_MIN)
        return
      }
      plane.position.set(originX + Math.cos(heading) * d, CRUISE_Y, originZ + Math.sin(heading) * d)
      plane.rotation.y = -heading
      nav.emissiveIntensity = night * 3 // a blinking wingtip would be lost at this size
    },
  }
}
