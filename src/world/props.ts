import * as THREE from 'three'
import type { Prop, PropKind, Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'

/** How much room each ornament takes on the ground, in metres. */
const PROP_R: Record<PropKind, number> = { fountain: 2.3, statue: 0.75, flowerbed: 1.7 }

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
    // A tiered fountain: a basin, a stem, an upper bowl and a plume of water
    // falling back into it. The silhouette is the point — a plinth with a stick
    // on it could be anything, and at street distance that is all you see.
    fountain: () => [
      { geo: ring(2.7, 0.6), mat: stone(0xa9a294) }, // basin wall
      { geo: disc(2.6, 0.16, 0.5), mat: water() }, // the pool in it
      { geo: disc(2.75, 0.12, 0.62), mat: stone(0xb9b2a4) }, // coping to sit on
      { geo: cyl(0.24, 0.4, 1.3, 0.5), mat: stone(0xb5aea0) }, // stem
      { geo: bowl(1.15, 0.34, 1.75), mat: stone(0xb9b2a4) }, // upper bowl
      { geo: disc(1.0, 0.1, 1.92), mat: water() }, // and the water in it
      { geo: cyl(0.16, 0.1, 1.5, 2.0), mat: jet() }, // the jet going up
      { geo: spray(1.05, 1.5, 2.05), mat: jet() }, // and falling back down
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
