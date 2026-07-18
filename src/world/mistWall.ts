import * as THREE from 'three'

export interface MistWall {
  object: THREE.Object3D
  /** Match the veil to the current fog colour — day/night and neon flow through it. */
  setColor(color: THREE.Color): void
  dispose(): void
}

/** A 1×N alpha ramp texture (white RGB; the tint comes from the material colour). */
function rampTexture(alphaAt: (t: number) => number): THREE.DataTexture {
  const rows = 64
  const data = new Uint8Array(rows * 4)
  for (let i = 0; i < rows; i++) {
    const t = i / (rows - 1) // 0 at the bottom, 1 at the top
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 255
    data[i * 4 + 3] = Math.max(0, Math.min(255, Math.round(255 * alphaAt(t))))
  }
  const tex = new THREE.DataTexture(data, 1, rows, THREE.RGBAFormat)
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.needsUpdate = true
  return tex
}

/** A square tube standing on the boundary — a 4-sided cylinder with its edges (not
 *  its corners) squared to the x/z axes at ±`halfExtent`. */
function squareTube(halfExtent: number, height: number): THREE.CylinderGeometry {
  const geo = new THREE.CylinderGeometry(halfExtent * Math.SQRT2, halfExtent * Math.SQRT2, height, 4, 1, true)
  geo.rotateY(Math.PI / 4) // put the flat faces on the axes, corners on the diagonals
  return geo
}

/**
 * The wall around the world's edge — a square ring matching the square ground the
 * city is built on, so it hides the ground's rim and the road stubs OSM spills
 * past it. The always-on distance fog can't do this: it is CAMERA-relative and
 * never veils the edge you drive TOWARD (the boats lesson in AGENTS.md).
 *
 * Two coincident layers:
 *  - a **veil** in the fog colour, densest at the ground and fading to sky, so the
 *    world dissolves into haze. Its colour tracks the fog (`setColor`), so day,
 *    night and neon all flow through it with no ThemeController hook.
 *  - a **marker** — a bright amber band low on the wall, in its own fixed colour,
 *    so the limit reads as a deliberate edge and not a bug. Fog-coloured haze alone
 *    blends into the sky and left players unsure whether they'd hit the boundary.
 */
export function createMistWall(halfExtent: number): MistWall {
  const group = new THREE.Group()

  // Veil: dense from the ground up (a solid lower band, not a gradient that peaks
  // underground), then fading out overhead.
  const veilH = 120
  const veilFloor = -30
  const veilGeo = squareTube(halfExtent, veilH)
  const veilTex = rampTexture((t) => {
    const solid = 0.42 // opaque through the lower ~42% (ground + eye-line), then fade
    return t <= solid ? 1 : Math.pow(1 - (t - solid) / (1 - solid), 1.5)
  })
  const veilMat = new THREE.MeshBasicMaterial({
    map: veilTex,
    transparent: true,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  })
  const veil = new THREE.Mesh(veilGeo, veilMat)
  veil.position.y = veilFloor + veilH / 2
  veil.renderOrder = 2

  // Marker: a bright amber wall low down. It must be OPAQUE from below the ground
  // up through eye level, or it doesn't read — the first cut ramped its alpha to a
  // peak ~35m UNDERGROUND and left only ~20% at the height you actually look, so
  // the limit stayed invisible. Solid amber through the lower band, fading into the
  // veil above.
  const bandH = 58
  const bandFloor = -12
  const bandGeo = squareTube(halfExtent, bandH)
  const bandTex = rampTexture((t) => {
    const solid = 0.62 // fully opaque through the lower ~62%: below-ground, ground, eye level
    return t <= solid ? 1 : Math.pow(1 - (t - solid) / (1 - solid), 1.3)
  })
  const bandMat = new THREE.MeshBasicMaterial({
    map: bandTex,
    color: 0xffa81e, // vivid amber — reads against green ground, blue sky and dark neon
    transparent: true,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  })
  const band = new THREE.Mesh(bandGeo, bandMat)
  band.position.y = bandFloor + bandH / 2
  band.renderOrder = 3 // over the veil, so the marker colour wins at the base

  group.add(veil, band)

  return {
    object: group,
    setColor(color) {
      veilMat.color.copy(color) // the marker keeps its own colour
    },
    dispose() {
      veilGeo.dispose()
      veilTex.dispose()
      veilMat.dispose()
      bandGeo.dispose()
      bandTex.dispose()
      bandMat.dispose()
    },
  }
}
