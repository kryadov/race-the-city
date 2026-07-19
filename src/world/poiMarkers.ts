import * as THREE from 'three'
import type { ElevationProvider } from '../terrain/provider'

/** The kinds of point-of-interest the city labels: cafés, fuel stations and landmarks. */
export type PoiKind = 'cafe' | 'fuel' | 'landmark'

/** A place worth a signpost: where it stands (local metres) and what it is. */
export interface PoiMarker {
  x: number
  z: number
  kind: PoiKind
}

// A signpost is a thin post with a small panel bolted to the FRONT of it near
// the top; a tiny emissive disc on the panel's face is the "glyph" that reads
// from a distance.
const POST_R_TOP = 0.05
const POST_R_BOT = 0.07
const PANEL_W = 0.95
const PANEL_H = 0.68
const PANEL_T = 0.09
// The panel's centre height, near a passing driver's eyeline so it reads.
const PANEL_CY = 2.39
// The post rises behind the panel and stops flush with its top edge, so no bare
// pole pokes up above the sign (co-centred, it used to spike straight through
// the plate — палка пронизывала табличку).
const POST_H = PANEL_CY + PANEL_H / 2
// Bolt the panel to the post's FRONT (+z) face rather than centring it on the
// post: the round pole then sits wholly *behind* the plate instead of piercing
// through its readable face. POST_R_TOP is the post radius up where it mounts.
const PANEL_CZ = POST_R_TOP + PANEL_T / 2
const GLYPH_R = 0.2
const GLYPH_T = 0.05
// Stand the glyph proud of the panel's front (+z) face so the panel doesn't
// occlude it — the same trick roadDetail's arrow uses on its sign panel.
const GLYPH_Z = PANEL_CZ + PANEL_T / 2 + GLYPH_T / 2

/** A budget cap: POIs are sparse, but a huge dense city shouldn't run away. */
const MAX_MARKERS = 400

// A landmark POI sits on the very node that also raises the statue prop, so a
// marker planted at the point grows straight up through the monument. Step the
// plaque a fixed distance to one side so it reads as standing *beside* the
// sight, not skewered through it. Café and fuel markers stand on their own
// nodes with nothing to clash with, so only landmarks are stepped aside.
/** How far to one side a landmark plaque stands from its POI point, in metres —
 * a bit more than the widest statue footprint (see props.ts VARIANTS), so the
 * post clears the monument rather than brushing it. */
const SIGN_OFFSET_M = 2.6
/** Fixed seed so a landmark steps to the same side on every reload and browser:
 * the direction is hashed from the POI's position, not a running RNG, so it
 * never depends on array order (which OSM parsing does not fix), and never
 * jitters per frame. Matches the position-hash idiom in props.ts (pickVariant). */
const SIGN_SEED = 0x9e3779b1

/** Where a marker actually stands: its POI point, except a landmark, which is
 * stepped a fixed distance along a deterministic per-POI angle so its plaque
 * clears the statue it marks. */
function markerPos(p: PoiMarker): { x: number; z: number } {
  if (p.kind !== 'landmark') return { x: p.x, z: p.z }
  let h = SIGN_SEED
  h = Math.imul(h ^ Math.floor(p.x * 131), 0x85ebca6b)
  h = Math.imul(h ^ Math.floor(p.z * 131), 0xc2b2ae35)
  h ^= h >>> 15
  const angle = ((h >>> 0) / 0x100000000) * Math.PI * 2
  return { x: p.x + Math.cos(angle) * SIGN_OFFSET_M, z: p.z + Math.sin(angle) * SIGN_OFFSET_M }
}

/** Per-kind colouring. Café = warm brown/red, fuel = muted green, landmark =
 * warm gold/amber — the panel carries the distinction from every angle (a box
 * shows its colour on all faces), and the glyph echoes it, brighter and glowing. */
interface KindStyle {
  panel: number
  glyph: number
  glyphEmissive: number
}
const STYLES: Record<PoiKind, KindStyle> = {
  cafe: { panel: 0x8f4a38, glyph: 0xf0d2a6, glyphEmissive: 0xff9a4a },
  fuel: { panel: 0x2f7d3b, glyph: 0xd0efb2, glyphEmissive: 0x5bd070 },
  landmark: { panel: 0xc8912a, glyph: 0xf6e2a0, glyphEmissive: 0xffc23a },
}
const KINDS: PoiKind[] = ['cafe', 'fuel', 'landmark']

/**
 * Small signpost markers for points of interest (cafés, fuel stations and
 * landmarks), so the city has a few labelled spots.
 *
 * One instanced draw covers every post (they are all the same grey); the panel
 * and its glyph are instanced once per kind so each carries its own colour. So
 * the whole city's markers cost seven draw calls (the posts, plus a panel and a
 * glyph for each of the three kinds), not one mesh per signpost.
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
    const q = markerPos(p)
    pos.set(q.x, provider.heightAt(q.x, q.z), q.z)
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
  const buckets: Record<PoiKind, PoiMarker[]> = { cafe: [], fuel: [], landmark: [] }
  for (const p of list) buckets[p.kind].push(p)

  for (const kind of KINDS) {
    const bucket = buckets[kind]
    if (!bucket.length) continue
    const style = STYLES[kind]
    const panels = new THREE.InstancedMesh(panelGeo(), panelMat(style.panel), bucket.length)
    const glyphs = new THREE.InstancedMesh(glyphGeo(), glyphMat(style.glyph, style.glyphEmissive), bucket.length)
    bucket.forEach((p, i) => {
      const q = markerPos(p)
      pos.set(q.x, provider.heightAt(q.x, q.z), q.z)
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

/** The sign panel, at the mount height and stood proud of the post's front face
 * so the pole sits behind it rather than skewering through the plate. */
const panelGeo = (): THREE.BufferGeometry => {
  const g = new THREE.BoxGeometry(PANEL_W, PANEL_H, PANEL_T)
  g.translate(0, PANEL_CY, PANEL_CZ)
  return g
}

/** A thin disc lying flat against the panel's front face, standing proud of it. */
const glyphGeo = (): THREE.BufferGeometry => {
  const g = new THREE.CylinderGeometry(GLYPH_R, GLYPH_R, GLYPH_T, 12)
  g.rotateX(Math.PI / 2) // turn the disc so its flat face points along +z
  g.translate(0, PANEL_CY, GLYPH_Z)
  return g
}
