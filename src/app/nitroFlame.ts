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
      const g = new THREE.Group()

      const jet = (x: number, y: number, z: number, up: boolean, len: number): THREE.Group => {
        const j = new THREE.Group()
        j.add(cone(len, len * 0.15, OUTER, 0.55))
        j.add(cone(len * 0.53, len * 0.08, CORE, 0.9))
        j.position.set(x, y, z)
        // Cones point -x by default; -90° about z swings that to +y, out of a stack.
        if (up) j.rotation.z = -Math.PI / 2
        return j
      }

      // A model can say where its exhaust is; a work machine's stack fires at
      // the sky, and the tiller's rear face is its trailer's tailboard.
      const marks: THREE.Object3D[] = []
      mesh.traverse((o) => {
        if ((o.userData as { exhaust?: string }).exhaust) marks.push(o)
      })

      if (marks.length) {
        for (const m of marks) {
          const up = (m.userData as { exhaust?: string }).exhaust === 'up'
          g.add(jet(m.position.x, m.position.y, m.position.z, up, up ? 1.1 : 1.5))
        }
      } else {
        // Otherwise: out of the middle of the rear face, which is right for
        // anything with a tailpipe, and fits a vehicle we haven't built yet.
        const box = new THREE.Box3().setFromObject(mesh)
        const y = Math.max(0.3, box.min.y + (box.max.y - box.min.y) * 0.22)
        const spread = Math.min(0.45, (box.max.z - box.min.z) * 0.22)
        for (const z of [spread, -spread]) g.add(jet(box.min.x + 0.05, y, z, false, 1.5))
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
