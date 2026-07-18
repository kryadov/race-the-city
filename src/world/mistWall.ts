import * as THREE from 'three'

export interface MistWall {
  mesh: THREE.Mesh
  /** Match the wall to the current fog colour — day/night and neon flow through it. */
  setColor(color: THREE.Color): void
  dispose(): void
}

/**
 * A ring of mist standing at the world's edge.
 *
 * The always-on distance fog is CAMERA-relative, so it never hides the edge you
 * drive TOWARD — the ground mesh's hard rim and the road stubs that OSM lets
 * spill past it sit right in front of the car, in clear air (the boats lesson in
 * AGENTS.md). This hides them as an actual object: an inward-facing cylinder
 * shell whose alpha is dense at the ground and fades out with height, so the
 * world dissolves into haze before the car reaches the real geometry edge.
 *
 * It carries no day-styled look of its own — it renders the fog colour by
 * construction (`setColor`, called each frame from the loop), and the fog colour
 * is already themed for the time of day and darkened for neon. So, unlike the
 * solid world meshes, it needs no ThemeController registration to stay in step.
 */
export function createMistWall(radius: number, height = 130, floor = -50): MistWall {
  const geo = new THREE.CylinderGeometry(radius, radius, height, 96, 1, true)

  // A cylinder's v runs 0 at the bottom to 1 at the top. Ramp the alpha from
  // opaque at the ground to clear overhead, on a soft curve so the top isn't a
  // hard line. White RGB — the tint comes from the material colour (the fog).
  const rows = 64
  const ramp = new Uint8Array(rows * 4)
  for (let i = 0; i < rows; i++) {
    const t = i / (rows - 1) // 0 bottom .. 1 top
    ramp[i * 4] = 255
    ramp[i * 4 + 1] = 255
    ramp[i * 4 + 2] = 255
    ramp[i * 4 + 3] = Math.round(255 * Math.pow(1 - t, 1.5))
  }
  const tex = new THREE.DataTexture(ramp, 1, rows, THREE.RGBAFormat)
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.needsUpdate = true

  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    side: THREE.BackSide, // the ring is seen from the inside
    depthWrite: false,
    fog: false, // it IS the fog colour; don't let distance fog double-tint it
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.y = floor + height / 2
  mesh.renderOrder = 2 // drawn after the opaque world, so it veils the stubs behind it

  return {
    mesh,
    setColor(color) {
      mat.color.copy(color)
    },
    dispose() {
      geo.dispose()
      tex.dispose()
      mat.dispose()
    },
  }
}
