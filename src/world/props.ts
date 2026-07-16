import * as THREE from 'three'
import type { Prop, PropKind, Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'

/** How much room each ornament takes on the ground, in metres. */
const PROP_R: Record<PropKind, number> = { fountain: 3.3, statue: 0.75, flowerbed: 1.7 }

/**
 * Footprints for the collision grid: you should not be able to drive through a
 * fountain. Squares rather than circles, because the grid takes polygons — and
 * at this size nobody can tell.
 */
export function propFootprints(props: Prop[]): Vec2[][] {
  return props.map((p) => {
    const r = PROP_R[p.kind]
    return [
      { x: p.at.x - r, z: p.at.z - r },
      { x: p.at.x + r, z: p.at.z - r },
      { x: p.at.x + r, z: p.at.z + r },
      { x: p.at.x - r, z: p.at.z + r },
    ]
  })
}

/**
 * Street ornaments from OSM: fountains, statues and flowerbeds.
 *
 * One instanced draw per kind for the whole city — three in all — so a park full
 * of them costs the same as one.
 */
export function buildProps(props: Prop[], provider: ElevationProvider): THREE.Object3D {
  const group = new THREE.Group()
  if (!props.length) return group

  const parts: Record<PropKind, () => { geo: THREE.BufferGeometry; mat: THREE.Material }[]> = {
    // A city fountain, at the size one actually is: a wide basin you could sit
    // on, two tiers, a central jet, and arcs of water thrown in from the rim.
    // The arcs are the whole point — they are what says "fountain" from across
    // the square, and without them this is a plinth with a stick on it.
    fountain: () => [
      { geo: ring(3.2, 0.55), mat: stone(0xa9a294) }, // basin wall
      { geo: disc(3.35, 0.14, 0.55), mat: stone(0xb9b2a4) }, // coping, wide enough to sit on
      { geo: disc(3.1, 0.16, 0.45), mat: water() }, // the pool
      { geo: cyl(0.3, 0.5, 1.4, 0.5), mat: stone(0xb5aea0) }, // stem
      { geo: bowl(1.5, 0.4, 1.85), mat: stone(0xb9b2a4) }, // lower tier
      { geo: disc(1.35, 0.1, 2.06), mat: water() },
      { geo: cyl(0.18, 0.24, 0.95, 2.15), mat: stone(0xb5aea0) }, // upper stem
      { geo: bowl(0.8, 0.28, 2.95), mat: stone(0xb9b2a4) }, // upper tier
      { geo: disc(0.7, 0.08, 3.1), mat: water() },
      { geo: cyl(0.12, 0.07, 1.4, 3.2), mat: jet() }, // the central jet
      { geo: spray(0.75, 1.2, 3.3), mat: jet() }, // falling off the top tier
      ...rimArcs(6, 2.55, 1.5, 0.9).map((geo) => ({ geo, mat: jet() })),
    ],
    // A plinth with a figure on it — read at a distance, not up close.
    statue: () => [
      { geo: boxGeo(1.2, 0.9, 1.2, 0.45), mat: stone(0x8d8778) },
      { geo: boxGeo(0.42, 1.5, 0.34, 1.65), mat: stone(0x9a9484) },
      { geo: sphere(0.19, 2.5), mat: stone(0x9a9484) },
    ],
    // A low kerb of soil with a bloom of colour on top.
    flowerbed: () => [
      { geo: ring(1.6, 0.22), mat: stone(0x9c9384) },
      { geo: disc(1.45, 0.14, 0.2), mat: soil() },
      { geo: disc(1.35, 0.22, 0.3), mat: bloom() },
    ],
  }

  for (const kind of Object.keys(parts) as PropKind[]) {
    const here = props.filter((p) => p.kind === kind)
    if (!here.length) continue
    for (const part of parts[kind]()) {
      const mesh = new THREE.InstancedMesh(part.geo, part.mat, here.length)
      const m = new THREE.Matrix4()
      const q = new THREE.Quaternion()
      const pos = new THREE.Vector3()
      const one = new THREE.Vector3(1, 1, 1)
      here.forEach((p, i) => {
        pos.set(p.at.x, provider.heightAt(p.at.x, p.at.z), p.at.z)
        mesh.setMatrixAt(i, m.compose(pos, q, one))
      })
      mesh.instanceMatrix.needsUpdate = true
      group.add(mesh)
    }
  }
  return group
}

const stone = (color: number): THREE.Material =>
  new THREE.MeshStandardMaterial({ color, flatShading: true })
const water = (): THREE.Material =>
  new THREE.MeshStandardMaterial({
    color: 0x4f9ad0,
    transparent: true,
    opacity: 0.85,
    flatShading: true,
    // A little glow, so the water reads as water from across the square rather
    // than as a blue-grey disc.
    emissive: new THREE.Color(0x1d5f92),
    emissiveIntensity: 0.35,
  })
/** Moving water: brighter and more translucent than the pool it falls into. */
const jet = (): THREE.Material =>
  new THREE.MeshStandardMaterial({
    color: 0xd6ecff,
    transparent: true,
    opacity: 0.5,
    flatShading: true,
    emissive: new THREE.Color(0x9fd0f0),
    emissiveIntensity: 0.5,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
const soil = (): THREE.Material => new THREE.MeshStandardMaterial({ color: 0x4a3728, flatShading: true })
const bloom = (): THREE.Material => new THREE.MeshStandardMaterial({ color: 0xc8477e, flatShading: true })

const boxGeo = (w: number, h: number, d: number, y: number): THREE.BufferGeometry => {
  const g = new THREE.BoxGeometry(w, h, d)
  g.translate(0, y, 0)
  return g
}
const cyl = (rTop: number, rBot: number, h: number, y: number): THREE.BufferGeometry => {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, 8)
  g.translate(0, y + h / 2, 0)
  return g
}
const disc = (r: number, h: number, y: number): THREE.BufferGeometry => {
  const g = new THREE.CylinderGeometry(r, r, h, 12)
  g.translate(0, y, 0)
  return g
}
const sphere = (r: number, y: number): THREE.BufferGeometry => {
  const g = new THREE.SphereGeometry(r, 8, 6)
  g.translate(0, y, 0)
  return g
}
/**
 * Arcs of water thrown from the rim toward the middle.
 *
 * One geometry per arc, each with its rotation baked in, so every fountain in
 * the city still costs one instanced draw per arc — a handful for the lot,
 * rather than a mesh per fountain.
 *
 * @param n how many arcs around the rim
 * @param r how far out they start
 * @param rise how high they go
 * @param reach how far in they land
 */
const rimArcs = (n: number, r: number, rise: number, reach: number): THREE.BufferGeometry[] => {
  const out: THREE.BufferGeometry[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    // A half-torus standing on its edge reads as a jet arcing over and down.
    const g = new THREE.TorusGeometry((r - reach) / 2 + 0.35, 0.055, 4, 10, Math.PI)
    g.scale(1, rise / ((r - reach) / 2 + 0.35), 1)
    g.rotateY(Math.PI / 2) // stand the ring up
    g.translate((r + reach) / 2, 0.75, 0) // out on the rim, above the water
    g.rotateY(-a) // and around to its place
    out.push(g)
  }
  return out
}

/** A shallow open bowl, mouth up — the fountain's upper tier. */
const bowl = (r: number, h: number, y: number): THREE.BufferGeometry => {
  const g = new THREE.CylinderGeometry(r, r * 0.35, h, 12, 1, true)
  g.translate(0, y + h / 2, 0)
  return g
}

/** A cone of falling water, mouth down, around the jet. */
const spray = (r: number, h: number, y: number): THREE.BufferGeometry => {
  const g = new THREE.ConeGeometry(r, h, 12, 1, true)
  g.rotateX(Math.PI) // apex up: water spreading as it falls
  g.translate(0, y + h / 2, 0)
  return g
}

/** An open rim: the wall of a basin or a flowerbed's kerb. */
const ring = (r: number, h: number): THREE.BufferGeometry => {
  const g = new THREE.CylinderGeometry(r, r, h, 14, 1, true)
  g.translate(0, h / 2, 0)
  return g
}
