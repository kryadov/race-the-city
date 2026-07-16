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
    // A round basin with a plinth and a spout of water above it.
    fountain: () => [
      { geo: ring(2.2, 0.45), mat: stone(0xa9a294) },
      { geo: disc(2.0, 0.12, 0.32), mat: water() },
      { geo: cyl(0.28, 0.28, 1.1, 0.45), mat: stone(0xb5aea0) },
      { geo: cyl(0.06, 0.02, 1.5, 1.5), mat: water() },
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
  new THREE.MeshStandardMaterial({ color: 0x4f9ad0, transparent: true, opacity: 0.8, flatShading: true })
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
/** An open rim: the wall of a basin or a flowerbed's kerb. */
const ring = (r: number, h: number): THREE.BufferGeometry => {
  const g = new THREE.CylinderGeometry(r, r, h, 14, 1, true)
  g.translate(0, h / 2, 0)
  return g
}
