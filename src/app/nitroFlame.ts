import * as THREE from 'three'

export interface NitroFlame {
  /**
   * Fit a fresh flame to a vehicle mesh and ride along with it. Call on a newly
   * built mesh, before it is placed in the world: the exhaust point is taken
   * from the mesh's own bounding box, which is only in model space while its
   * matrix is still identity.
   */
  attachTo(mesh: THREE.Object3D): void
  /** @param active whether the boost is running */
  update(active: boolean, dt: number): void
}

const CORE = 0xfff0b0
const OUTER = 0xff5a1e

/**
 * An afterburner plume out of the back of the car while nitro is lit.
 *
 * Rather than hand-placing an exhaust on all nineteen models, the plume is
 * pinned to the rear face of the mesh's bounding box — so a tiller and a lorry
 * both get one in the right place, and so will the next vehicle added.
 */
export function createNitroFlame(): NitroFlame {
  let group: THREE.Group | null = null
  let clock = 0

  const cone = (len: number, rad: number, color: number, opacity: number): THREE.Mesh => {
    const geo = new THREE.ConeGeometry(rad, len, 10)
    geo.rotateZ(Math.PI / 2) // point down -x, out the back
    geo.translate(-len / 2, 0, 0)
    return new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
  }

  return {
    attachTo(mesh) {
      // Fresh geometry each time: setVehicleMesh disposes the old mesh's whole
      // tree, this flame included.
      const box = new THREE.Box3().setFromObject(mesh)
      const g = new THREE.Group()
      const y = Math.max(0.3, box.min.y + (box.max.y - box.min.y) * 0.22)
      const spread = Math.min(0.45, (box.max.z - box.min.z) * 0.22)
      for (const z of [spread, -spread]) {
        const jet = new THREE.Group()
        jet.add(cone(1.5, 0.22, OUTER, 0.55))
        jet.add(cone(0.8, 0.12, CORE, 0.9))
        jet.position.set(box.min.x + 0.05, y, z)
        g.add(jet)
      }
      g.visible = false
      mesh.add(g)
      group = g
    },
    update(active, dt) {
      if (!group) return
      group.visible = active
      if (!active) return
      clock += dt
      // Flicker: the jets pulse out of step, so the plume never looks like a
      // solid cone bolted to the bumper.
      group.children.forEach((jet, i) => {
        const f = 0.75 + Math.sin(clock * 42 + i * 2.1) * 0.15 + Math.sin(clock * 97 + i) * 0.1
        jet.scale.set(f, 1, 1)
      })
    },
  }
}
