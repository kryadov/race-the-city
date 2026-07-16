import * as THREE from 'three'

export type AircraftKind = 'airliner' | 'turboprop' | 'jet' | 'helicopter'

interface Profile {
  /** Cruising height, metres. */
  alt: number
  speed: number // m/s
  scale: number
  trail: boolean
}

/**
 * Aircraft are far away and genuinely a few pixels across at true size, so each
 * is drawn oversized — the higher it flies, the more it needs.
 */
const PROFILES: Record<AircraftKind, Profile> = {
  airliner: { alt: 430, speed: 95, scale: 9, trail: true },
  jet: { alt: 620, speed: 150, scale: 7, trail: true },
  turboprop: { alt: 260, speed: 55, scale: 6, trail: false },
  helicopter: { alt: 130, speed: 28, scale: 3.2, trail: false },
}

const SPAN = 3000 // how far out they enter and leave
const GAP_MIN = 18 // seconds between arrivals
const GAP_MAX = 55

export interface Aircraft {
  update(dt: number, camX: number, camZ: number, night: number): void
  setEnabled(on: boolean): void
}

const mat = (c: number): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color: c, flatShading: true })

/** Every airframe points +x. */
function build(kind: AircraftKind): THREE.Group {
  const g = new THREE.Group()
  const body = mat(kind === 'jet' ? 0x9aa4ae : kind === 'helicopter' ? 0x2f4f6f : 0xe8ecf2)

  if (kind === 'helicopter') {
    const cabin = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 6), body)
    cabin.scale.set(1.5, 1, 1)
    g.add(cabin)
    const tail = new THREE.Mesh(new THREE.BoxGeometry(6, 0.4, 0.4), body)
    tail.position.x = -4
    g.add(tail)
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.4, 0.15), body)
    fin.position.set(-6.6, 0.6, 0)
    g.add(fin)
    for (const x of [0.6, -0.6]) {
      const skid = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 0.12), mat(0x2a2c30))
      skid.position.set(x * 0.4, -1.5, x * 1.4)
      g.add(skid)
    }
    // Rotors spin: a helicopter with still blades reads as a crash.
    const rotor = new THREE.Group()
    for (let i = 0; i < 2; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(11, 0.08, 0.5), mat(0x33363d))
      blade.rotation.y = (i * Math.PI) / 2
      rotor.add(blade)
    }
    rotor.position.y = 1.7
    rotor.userData.rotor = 'main'
    g.add(rotor)
    const tailRotor = new THREE.Group()
    const tb = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.4, 0.2), mat(0x33363d))
    tailRotor.add(tb)
    tailRotor.position.set(-6.6, 0.6, 0.3)
    tailRotor.userData.rotor = 'tail'
    g.add(tailRotor)
  } else {
    const long = kind === 'turboprop' ? 9 : kind === 'jet' ? 11 : 12
    const fuselage = new THREE.CylinderGeometry(kind === 'jet' ? 0.6 : 0.9, 0.5, long, 7)
    fuselage.rotateZ(Math.PI / 2)
    g.add(new THREE.Mesh(fuselage, body))
    // Swept wings on the jet, straight on the others — the silhouette is the tell.
    const wing = new THREE.BoxGeometry(kind === 'jet' ? 3.4 : 2.6, 0.22, kind === 'turboprop' ? 11 : 13)
    const w = new THREE.Mesh(wing, body)
    if (kind === 'jet') w.position.x = -1
    g.add(w)
    const tail = new THREE.BoxGeometry(1.6, 0.2, 5)
    tail.translate(-long * 0.42, 0, 0)
    g.add(new THREE.Mesh(tail, body))
    const fin = new THREE.BoxGeometry(1.6, 2.6, 0.2)
    fin.translate(-long * 0.42, 1.3, 0)
    g.add(new THREE.Mesh(fin, body))
    if (kind === 'turboprop') {
      // Engines and props out on the wings.
      for (const z of [3.2, -3.2]) {
        const nac = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.4, 2.4, 6), body)
        nac.rotation.z = Math.PI / 2
        nac.position.set(0.6, 0, z)
        g.add(nac)
        const prop = new THREE.Group()
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3, 0.3), mat(0x2a2c30))
        prop.add(blade)
        prop.position.set(1.9, 0, z)
        prop.userData.rotor = 'prop'
        g.add(prop)
      }
    } else if (kind === 'airliner') {
      for (const z of [3.6, -3.6]) {
        const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 2.2, 7), mat(0x9aa2ac))
        eng.rotation.z = Math.PI / 2
        eng.position.set(0.4, -0.7, z)
        g.add(eng)
      }
    }
  }
  g.scale.setScalar(PROFILES[kind].scale)
  return g
}

function trailMesh(): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(SPAN * 0.35, 6)
  geo.rotateX(-Math.PI / 2)
  geo.translate(-SPAN * 0.175, 0, 0)
  return new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, depthWrite: false }),
  )
}

/**
 * Traffic in the sky: airliners, bizjets, turboprops and helicopters, one at a
 * time on a straight line past the player.
 *
 * It is scenery a few hundred metres up, so nothing here navigates — but the
 * kinds differ in height, speed and silhouette, which is all you can read at
 * that range anyway.
 */
export function createAircraft(scene: THREE.Scene, rand: () => number = Math.random): Aircraft {
  const group = new THREE.Group()
  scene.add(group)
  const kinds = Object.keys(PROFILES) as AircraftKind[]
  const frames = new Map<AircraftKind, THREE.Group>()
  for (const k of kinds) {
    const f = build(k)
    if (PROFILES[k].trail) f.add(trailMesh())
    f.visible = false
    group.add(f)
    frames.set(k, f)
  }

  let wait = 6 + rand() * GAP_MAX
  let kind: AircraftKind | null = null
  let t = 0
  let heading = 0
  let originX = 0
  let originZ = 0
  let spin = 0

  const hide = (): void => {
    for (const f of frames.values()) f.visible = false
  }

  return {
    setEnabled(on) {
      if (!on) {
        kind = null
        hide()
      }
    },
    update(dt, camX, camZ, night) {
      if (!kind) {
        wait -= dt
        if (wait > 0) return
        kind = kinds[Math.floor(rand() * kinds.length)]
        heading = rand() * Math.PI * 2
        const offset = (rand() - 0.5) * 1100 // how wide of us it passes
        originX = camX - Math.cos(heading) * SPAN * 0.5 - Math.sin(heading) * offset
        originZ = camZ - Math.sin(heading) * SPAN * 0.5 + Math.cos(heading) * offset
        t = 0
        hide()
        frames.get(kind)!.visible = true
      }

      const p = PROFILES[kind]
      t += dt
      const d = t * p.speed
      if (d > SPAN) {
        kind = null
        hide()
        wait = GAP_MIN + rand() * (GAP_MAX - GAP_MIN)
        return
      }

      const f = frames.get(kind)!
      f.position.set(originX + Math.cos(heading) * d, p.alt, originZ + Math.sin(heading) * d)
      f.rotation.y = -heading
      spin += dt
      f.traverse((o) => {
        const r = (o.userData as { rotor?: string }).rotor
        if (r === 'main') o.rotation.y = spin * 26
        else if (r === 'tail' || r === 'prop') o.rotation.x = spin * 34
      })
      // A navigation light, since at this size a blinking wingtip would be lost.
      void night
    },
  }
}
