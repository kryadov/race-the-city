import * as THREE from 'three'
import type { Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import { pointInPolygon } from '../physics/collide'

const GREEN_OFFSET = 0.08 // just above terrain, below roads (0.15)
const MAX_TREES = 600
const TREE_AREA = 550 // one scattered tree per ~this many m² of green
const MAX_PER_AREA = 60 // cap scatter per polygon

/** Green areas as flat polygons plus low-poly instanced trees. */
export function buildGreenery(green: Vec2[][], trees: Vec2[], provider: ElevationProvider): THREE.Object3D {
  const group = new THREE.Group()

  const mat = new THREE.MeshStandardMaterial({ color: 0x4c7a42, flatShading: true, side: THREE.DoubleSide })
  for (const ring of green) {
    if (ring.length < 3) continue
    const shape = new THREE.Shape()
    shape.moveTo(ring[0].x, ring[0].z)
    for (let i = 1; i < ring.length; i++) shape.lineTo(ring[i].x, ring[i].z)
    shape.closePath()
    const geo = new THREE.ShapeGeometry(shape)
    geo.rotateX(Math.PI / 2) // XY shape → XZ plane, z preserved
    let cx = 0
    let cz = 0
    for (const p of ring) {
      cx += p.x
      cz += p.z
    }
    geo.translate(0, provider.heightAt(cx / ring.length, cz / ring.length) + GREEN_OFFSET, 0)
    group.add(new THREE.Mesh(geo, mat))
  }

  const spots = collectTreeSpots(green, trees)
  if (spots.length) group.add(buildTrees(spots, provider))
  return group
}

/** Explicit tree points plus a capped scatter inside green polygons. */
function collectTreeSpots(green: Vec2[][], trees: Vec2[]): Vec2[] {
  const spots: Vec2[] = trees.slice(0, MAX_TREES)
  for (const ring of green) {
    if (spots.length >= MAX_TREES || ring.length < 3) continue
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity
    for (const p of ring) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.z < minZ) minZ = p.z
      if (p.z > maxZ) maxZ = p.z
    }
    const area = (maxX - minX) * (maxZ - minZ)
    const want = Math.min(MAX_PER_AREA, Math.floor(area / TREE_AREA))
    for (let i = 0; i < want * 2 && spots.length < MAX_TREES; i++) {
      const x = minX + Math.random() * (maxX - minX)
      const z = minZ + Math.random() * (maxZ - minZ)
      if (pointInPolygon(x, z, ring)) spots.push({ x, z })
    }
  }
  return spots
}

function buildTrees(spots: Vec2[], provider: ElevationProvider): THREE.Object3D {
  const g = new THREE.Group()
  const n = spots.length

  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.3, 2, 5)
  const trunk = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x6b4a2b, flatShading: true }), n)
  const folGeo = new THREE.ConeGeometry(1.5, 3.4, 6)
  const foliage = new THREE.InstancedMesh(folGeo, new THREE.MeshStandardMaterial({ color: 0x3f7a3a, flatShading: true }), n)

  const m = new THREE.Matrix4()
  for (let i = 0; i < n; i++) {
    const y = provider.heightAt(spots[i].x, spots[i].z)
    m.makeTranslation(spots[i].x, y + 1, spots[i].z) // trunk base on ground
    trunk.setMatrixAt(i, m)
    m.makeTranslation(spots[i].x, y + 3.7, spots[i].z) // foliage above trunk
    foliage.setMatrixAt(i, m)
  }
  trunk.instanceMatrix.needsUpdate = true
  foliage.instanceMatrix.needsUpdate = true
  g.add(trunk, foliage)
  return g
}
