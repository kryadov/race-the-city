import * as THREE from 'three'
import type { BuildingKind } from '../geo/types'

/** Nominal storey height, in metres. Actual storeys stretch to fit the building. */
export const FLOOR_H = 3.2
/** One tile is this many storeys tall; its bottom one is the ground floor. */
export const STOREYS_PER_TILE = 8
/** One bay of wall, in metres. */
export const BAY_W = 3.6
/** Bays per tile — the run of wall before the pattern repeats. */
export const BAYS_PER_TILE = 4
/** How much wall one tile spans horizontally, in metres. */
export const TILE_SPAN = BAY_W * BAYS_PER_TILE

const PX = 64 // px per storey and per bay
const TILE_W = PX * BAYS_PER_TILE
const TILE_H = PX * STOREYS_PER_TILE

/** Deterministic PRNG (mulberry32) — facades must not reshuffle per reload. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const LAYOUT_SEED = 0x5eed17
const LIGHT_SEED = 0x9e3779b
/** Roughly this share of windows are lit after dark. */
const LIT_SHARE = 0.62

/** Facade look per building class. */
interface Facade {
  cols: number // windows across a bay
  w: number // window width, fraction of the bay
  h: number // window height, fraction of a storey
  glass: string
  /** The ground floor: shops glaze to the pavement, homes get a plinth. */
  shopfront: boolean
  /** Chance a bay is solid wall — stair cores, party walls, blank gables. */
  blank: number
}

const FACADES: Record<BuildingKind, Facade> = {
  house: { cols: 2, w: 0.26, h: 0.4, glass: '#2b3a4a', shopfront: false, blank: 0.22 },
  apartments: { cols: 2, w: 0.3, h: 0.42, glass: '#2f4256', shopfront: false, blank: 0.16 },
  retail: { cols: 1, w: 0.74, h: 0.44, glass: '#22333f', shopfront: true, blank: 0.18 },
  office: { cols: 3, w: 0.26, h: 0.52, glass: '#1e3446', shopfront: true, blank: 0.08 },
  industrial: { cols: 4, w: 0.14, h: 0.22, glass: '#33414a', shopfront: false, blank: 0.45 },
  civic: { cols: 2, w: 0.34, h: 0.5, glass: '#2a3c4e', shopfront: true, blank: 0.2 },
}

/**
 * The UV a roof cap points at: the plain sliver at the very top of every tile.
 * That is what keeps a building on ONE material and one draw call, instead of
 * splitting walls and roof across two.
 */
export const ROOF_UV = { u: 0.5, v: 0.998 }

/**
 * One bay of one storey.
 *
 * `layout` and `lights` are separate streams on purpose: the plain and lit
 * textures must agree on where the windows ARE, and they only do that if the
 * layout draws from a sequence the lit pass can't advance.
 */
function drawBay(
  ctx: CanvasRenderingContext2D,
  f: Facade,
  bx: number,
  top: number,
  lit: boolean,
  layout: () => number,
  lights: () => number,
): void {
  if (layout() < f.blank) return // solid wall this bay

  const scale = 0.8 + layout() * 0.55 // bays aren't all glazed the same
  const ww = (PX / f.cols) * f.w * f.cols * scale
  const wh = PX * f.h * scale

  for (let c = 0; c < f.cols; c++) {
    const x = bx + (PX / f.cols) * (c + 0.5) - ww / 2
    const y = top + (PX - wh) * 0.42
    if (lit) {
      // Who's in is random: a regular grid of lit windows reads as wallpaper,
      // and an entirely lit slab reads as a light box.
      const warmth = 0.82 + lights() * 0.18 // nor is everyone's bulb the same
      ctx.fillStyle =
        lights() < LIT_SHARE ? `rgb(255, ${Math.round(217 * warmth)}, ${Math.round(138 * warmth)})` : '#0a0a0a'
    } else {
      ctx.fillStyle = f.glass
    }
    ctx.fillRect(x, y, ww, wh)
    if (!lit) {
      ctx.strokeStyle = 'rgba(0,0,0,.28)'
      ctx.lineWidth = 1
      ctx.strokeRect(x + 0.5, y + 0.5, ww - 1, wh - 1)
    }
  }
}

/** The ground floor: a shopfront's glazing, or a solid plinth for homes. */
function drawGroundFloor(ctx: CanvasRenderingContext2D, f: Facade, top: number, lit: boolean): void {
  if (!f.shopfront) {
    if (!lit) {
      // A plinth: darker than the wall, and no windows at pavement level.
      ctx.fillStyle = 'rgba(0,0,0,.16)'
      ctx.fillRect(0, top, TILE_W, PX)
    }
    return
  }
  const h = PX * 0.5
  const y = top + PX * 0.24
  for (let b = 0; b < BAYS_PER_TILE; b++) {
    const bx = b * PX
    ctx.fillStyle = lit ? '#ffe6a8' : '#23323d' // shops stay lit after dark
    ctx.fillRect(bx + PX * 0.08, y, PX * 0.84, h)
    if (!lit) {
      ctx.strokeStyle = 'rgba(0,0,0,.3)'
      ctx.lineWidth = 1
      ctx.strokeRect(bx + PX * 0.08 + 0.5, y + 0.5, PX * 0.84 - 1, h - 1)
    }
  }
  if (!lit) {
    ctx.fillStyle = 'rgba(0,0,0,.14)' // fascia above the glazing
    ctx.fillRect(0, top + PX * 0.08, TILE_W, PX * 0.1)
  }
}

function makeTexture(kind: BuildingKind, lit: boolean): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = TILE_W
  canvas.height = TILE_H
  const ctx = canvas.getContext('2d')!
  const f = FACADES[kind]

  // White ground: the wall's colour comes from vertex colours and the map
  // multiplies it. The lit copy inverts that — dark wall, glowing windows.
  ctx.fillStyle = lit ? '#000000' : '#ffffff'
  ctx.fillRect(0, 0, TILE_W, TILE_H)

  const kindSalt = kind.length * 7919
  const layout = makeRng(LAYOUT_SEED + kindSalt) // identical for both textures
  const lights = makeRng(LIGHT_SEED + kindSalt)

  // Canvas y grows downward while v grows up, so the ground floor is the BOTTOM
  // row and the storeys stack up from it.
  for (let s = 1; s < STOREYS_PER_TILE; s++) {
    const top = TILE_H - (s + 1) * PX
    for (let b = 0; b < BAYS_PER_TILE; b++) drawBay(ctx, f, b * PX, top, lit, layout, lights)
    if (!lit) {
      ctx.fillStyle = 'rgba(0,0,0,.10)' // floor slab line
      ctx.fillRect(0, top + PX - 3, TILE_W, 3)
    }
  }
  drawGroundFloor(ctx, f, TILE_H - PX, lit)

  // The plain sliver ROOF_UV samples, at the very top of the tile.
  ctx.fillStyle = lit ? '#000000' : '#ffffff'
  ctx.fillRect(0, 0, TILE_W, 2)

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.magFilter = THREE.LinearFilter
  tex.anisotropy = 4
  return tex
}

export interface FacadeMaterials {
  /** One shared material per class — six for the whole city. */
  of(kind: BuildingKind): THREE.MeshStandardMaterial
  /** Light the windows up after dusk. @param night 0..1 */
  setNight(night: number): void
  dispose(): void
}

export const BUILDING_KINDS: BuildingKind[] = ['house', 'apartments', 'retail', 'office', 'industrial', 'civic']

/**
 * Facade materials, one per class and shared by every building of it. Windows
 * are a repeating procedural texture rather than geometry, so a whole city's
 * worth costs six textures and not one extra triangle.
 */
export function createFacadeMaterials(): FacadeMaterials {
  const mats = new Map<BuildingKind, THREE.MeshStandardMaterial>()
  for (const k of BUILDING_KINDS) {
    mats.set(
      k,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        flatShading: true,
        side: THREE.DoubleSide,
        map: makeTexture(k, false),
        emissive: new THREE.Color(0xffd98a),
        emissiveMap: makeTexture(k, true),
        emissiveIntensity: 0,
      }),
    )
  }
  return {
    of: (kind) => mats.get(kind)!,
    setNight(night) {
      for (const m of mats.values()) m.emissiveIntensity = night * 1.15
    },
    dispose() {
      for (const m of mats.values()) {
        m.map?.dispose()
        m.emissiveMap?.dispose()
        m.dispose()
      }
      mats.clear()
    },
  }
}
