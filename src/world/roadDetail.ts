import * as THREE from 'three'
import type { Road, RoadKind, Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import { roadWidth } from './roads'

const DASH_KINDS = new Set<RoadKind>(['motorway', 'primary', 'secondary'])
const POLE_KINDS = new Set<RoadKind>(['motorway', 'primary'])
const DASH_SPACING = 7
const DASH_LEN = 3.2
const DASH_HW = 0.16
const MAX_DASHES = 4000
const POLE_SPACING = 16
const MAX_POLES = 260

/** Lightweight road dressing: dashed centre lines on wide roads + roadside poles. */
export function buildRoadDetail(roads: Road[], provider: ElevationProvider): THREE.Object3D {
  const group = new THREE.Group()
  const dash: number[] = []
  const poles: Vec2[] = []
  let dashes = 0

  for (const road of roads) {
    const wide = DASH_KINDS.has(road.kind)
    const poled = POLE_KINDS.has(road.kind)
    if ((!wide && !poled) || road.points.length < 2) continue
    const hw = roadWidth(road.kind) / 2
    let carryDash = 0
    let carryPole = 0

    for (let i = 0; i < road.points.length - 1; i++) {
      const a = road.points[i]
      const b = road.points[i + 1]
      const dx = b.x - a.x
      const dz = b.z - a.z
      const len = Math.hypot(dx, dz)
      if (len < 0.01) continue
      const ux = dx / len
      const uz = dz / len
      const nx = -uz
      const nz = ux

      if (wide && dashes < MAX_DASHES) {
        let d = carryDash
        for (; d < len && dashes < MAX_DASHES; d += DASH_SPACING) {
          const e = Math.min(d + DASH_LEN, len)
          emitDash(dash, a.x + ux * d, a.z + uz * d, a.x + ux * e, a.z + uz * e, nx, nz, provider)
          dashes++
        }
        carryDash = d - len
      }

      if (poled && poles.length < MAX_POLES) {
        let d = carryPole
        for (; d < len && poles.length < MAX_POLES; d += POLE_SPACING) {
          const cx = a.x + ux * d
          const cz = a.z + uz * d
          poles.push({ x: cx + nx * (hw + 0.6), z: cz + nz * (hw + 0.6) })
          if (poles.length < MAX_POLES) poles.push({ x: cx - nx * (hw + 0.6), z: cz - nz * (hw + 0.6) })
        }
        carryPole = d - len
      }
    }
  }

  if (dash.length) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(dash, 3))
    geo.computeVertexNormals()
    group.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xefe6bf, flatShading: true, side: THREE.DoubleSide })))
  }
  if (poles.length) group.add(buildPoles(poles, provider))
  return group
}

function emitDash(
  out: number[],
  ax: number,
  az: number,
  bx: number,
  bz: number,
  nx: number,
  nz: number,
  provider: ElevationProvider,
): void {
  const y = (x: number, z: number): number => provider.heightAt(x, z) + 0.18
  const pts: [number, number][] = [
    [ax + nx * DASH_HW, az + nz * DASH_HW],
    [bx + nx * DASH_HW, bz + nz * DASH_HW],
    [bx - nx * DASH_HW, bz - nz * DASH_HW],
    [ax - nx * DASH_HW, az - nz * DASH_HW],
  ]
  const tri = (i: number, j: number, k: number): void => {
    for (const p of [pts[i], pts[j], pts[k]]) out.push(p[0], y(p[0], p[1]), p[1])
  }
  tri(0, 1, 2)
  tri(0, 2, 3)
}

function buildPoles(pts: Vec2[], provider: ElevationProvider): THREE.Object3D {
  const im = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.1, 0.13, 1.2, 5),
    new THREE.MeshStandardMaterial({ color: 0x9a9aa2, flatShading: true }),
    pts.length,
  )
  const m = new THREE.Matrix4()
  for (let i = 0; i < pts.length; i++) {
    m.makeTranslation(pts[i].x, provider.heightAt(pts[i].x, pts[i].z) + 0.6, pts[i].z)
    im.setMatrixAt(i, m)
  }
  im.instanceMatrix.needsUpdate = true
  return im
}
