import * as THREE from 'three'
import type { ElevationProvider } from '../terrain/provider'

/** The two kinds of point-of-interest the city labels: cafés and fuel stations. */
export type PoiKind = 'cafe' | 'fuel'

/** A place worth a signpost: where it stands (local metres) and what it is. */
export interface PoiMarker {
  x: number
  z: number
  kind: PoiKind
}

// A signpost is a thin post with a small panel mounted near the top; a tiny
// emissive disc on the panel's face is the "glyph" that reads from a distance.
const POST_H = 2.2 // how tall the post stands, in metres
const POST_R_TOP = 0.05
const POST_R_BOT = 0.07
const PANEL_W = 0.95
const PANEL_H = 0.68
const PANEL_T = 0.09
// Mount the panel near the top of the post — its bottom a little below the post
// top so it reads as bolted on, not floating above it.
const PANEL_CY = POST_H - 0.15 + PANEL_H / 2
const GLYPH_R = 0.2
const GLYPH_T = 0.05
// Stand the glyph proud of the panel's front (+z) face so the panel doesn't
// occlude it — the same trick roadDetail's arrow uses on its sign panel.
const GLYPH_Z = PANEL_T / 2 + GLYPH_T / 2

/** A budget cap: POIs are sparse, but a huge dense city shouldn't run away. */
const MAX_MARKERS = 400

/** Per-kind colouring. Café = warm brown/red, fuel = muted green — the panel
 * carries the distinction from every angle (a box shows its colour on all faces),
 * and the glyph echoes it, brighter and glowing. */
interface KindStyle {
  panel: number
  glyph: number
  glyphEmissive: number
}
const STYLES: Record<PoiKind, KindStyle> = {
  cafe: { panel: 0x8f4a38, glyph: 0xf0d2a6, glyphEmissive: 0xff9a4a },
  fuel: { panel: 0x2f7d3b, glyph: 0xd0efb2, glyphEmissive: 0x5bd070 },
}
const KINDS: PoiKind[] = ['cafe', 'fuel']

/**
 * Small signpost markers for points of interest (cafés and fuel stations), so
 * the city has a few labelled spots.
 *
 * One instanced draw covers every post (they are all the same grey); the panel
 * and its glyph are instanced once per kind so each carries its own colour. So
 * the whole city's markers cost five draw calls, not one mesh per signpost.
 *
 * Every marker sits on the terrain via `provider.heightAt`, with the post base
 * on the ground and the structure built upward from it.
 */
export function buildPoiMarkers(pois: PoiMarker[], provider: ElevationProvider): THREE.Group {
  const group = new THREE.Group()
  if (!pois.length) return group
  const list = pois.slice(0, MAX_MARKERS)

  const m = new THREE.Matrix4()
  const pos = new THREE.Vector3()
  const noRot = new THREE.Quaternion()
  const one = new THREE.Vector3(1, 1, 1)

  // All posts in a single instanced draw — they are identical grey cylinders.
  const posts = new THREE.InstancedMesh(postGeo(), postMat(), list.length)
  list.forEach((p, i) => {
    pos.set(p.x, provider.heightAt(p.x, p.z), p.z)
    posts.setMatrixAt(i, m.compose(pos, noRot, one))
  })
  posts.instanceMatrix.needsUpdate = true
  // Markers are spread across the whole city; keep the batch off the frustum
  // culler so a look away from the middle can't blink them out as one.
  posts.frustumCulled = false
  posts.name = 'poi-posts'
  group.add(posts)

  // Panel + glyph, one instanced draw each per kind so the colour comes from a
  // distinct material the neon theme can restyle (rather than per-instance colour).
  const buckets: Record<PoiKind, PoiMarker[]> = { cafe: [], fuel: [] }
  for (const p of list) buckets[p.kind].push(p)

  for (const kind of KINDS) {
    const bucket = buckets[kind]
    if (!bucket.length) continue
    const style = STYLES[kind]
    const panels = new THREE.InstancedMesh(panelGeo(), panelMat(style.panel), bucket.length)
    const glyphs = new THREE.InstancedMesh(glyphGeo(), glyphMat(style.glyph, style.glyphEmissive), bucket.length)
    bucket.forEach((p, i) => {
      pos.set(p.x, provider.heightAt(p.x, p.z), p.z)
      m.compose(pos, noRot, one)
      panels.setMatrixAt(i, m)
      glyphs.setMatrixAt(i, m)
    })
    panels.instanceMatrix.needsUpdate = true
    glyphs.instanceMatrix.needsUpdate = true
    panels.frustumCulled = false
    glyphs.frustumCulled = false
    panels.name = `poi-${kind}-panel`
    glyphs.name = `poi-${kind}-glyph`
    group.add(panels, glyphs)
  }

  return group
}

/** Fresh materials per build, so a city teardown can dispose them cleanly
 * (the parent traverses the group and disposes geometry + material) without a
 * later build reusing a disposed singleton. All are MeshStandardMaterial so the
 * neon theme can flip them to a glowing wireframe and restore them off-neon. */
const postMat = (): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color: 0x8b8e94, flatShading: true })
const panelMat = (color: number): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, flatShading: true })
const glyphMat = (color: number, emissive: number): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({
    color,
    emissive: new THREE.Color(emissive),
    emissiveIntensity: 0.6, // a soft day glow; neon overrides then restores this
    flatShading: true,
  })

/** A slightly tapered post, its base at local y=0 so the instance matrix can
 * drop it straight onto the ground height. */
const postGeo = (): THREE.BufferGeometry => {
  const g = new THREE.CylinderGeometry(POST_R_TOP, POST_R_BOT, POST_H, 6)
  g.translate(0, POST_H / 2, 0)
  return g
}

/** The sign panel, centred at the mount height. */
const panelGeo = (): THREE.BufferGeometry => {
  const g = new THREE.BoxGeometry(PANEL_W, PANEL_H, PANEL_T)
  g.translate(0, PANEL_CY, 0)
  return g
}

/** A thin disc lying flat against the panel's front face, standing proud of it. */
const glyphGeo = (): THREE.BufferGeometry => {
  const g = new THREE.CylinderGeometry(GLYPH_R, GLYPH_R, GLYPH_T, 12)
  g.rotateX(Math.PI / 2) // turn the disc so its flat face points along +z
  g.translate(0, PANEL_CY, GLYPH_Z)
  return g
}
