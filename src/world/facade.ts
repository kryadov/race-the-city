import * as THREE from 'three'
import type { BuildingKind } from '../geo/types'

/** One texture tile covers one storey, this tall and this wide, in metres. */
export const FLOOR_H = 3.2
export const BAY_W = 3.6

const TILE = 64 // px per tile side

/** Facade look per building class: window size, spacing and glass tint. */
interface Facade {
  cols: number // windows across one bay
  w: number // window width, fraction of the bay
  h: number // window height, fraction of the storey
  glass: string
}

const FACADES: Record<BuildingKind, Facade> = {
  house: { cols: 2, w: 0.24, h: 0.4, glass: '#2b3a4a' },
  apartments: { cols: 2, w: 0.3, h: 0.42, glass: '#2f4256' },
  // shopfronts and towers: wide glazing, nearly a ribbon
  retail: { cols: 1, w: 0.74, h: 0.44, glass: '#22333f' },
  office: { cols: 3, w: 0.26, h: 0.52, glass: '#1e3446' },
  industrial: { cols: 4, w: 0.14, h: 0.22, glass: '#33414a' },
  civic: { cols: 2, w: 0.34, h: 0.5, glass: '#2a3c4e' },
}

/**
 * The UV a roof cap points at. The top rows of every tile are left plain so the
 * caps can sample white and come out the building's own colour: that keeps the
 * whole building on ONE material and one draw call, instead of splitting walls
 * and roof across two.
 */
export const ROOF_UV = { u: 0.5, v: 0.985 }

function drawTile(ctx: CanvasRenderingContext2D, f: Facade, lit: boolean): void {
  // White ground: the wall's own colour comes from the vertex colours, which the
  // map multiplies. Windows are painted darker than white; at night the emissive
  // copy inverts that — dark wall, glowing windows.
  ctx.fillStyle = lit ? '#000000' : '#ffffff'
  ctx.fillRect(0, 0, TILE, TILE)

  const bandTop = TILE * 0.03 // the plain strip ROOF_UV samples
  const wpx = (BAY_W / f.cols) * (TILE / BAY_W) // bay width in px
  const ww = wpx * f.w * f.cols
  const wh = TILE * f.h

  for (let c = 0; c < f.cols; c++) {
    const cx = wpx * (c + 0.5)
    const x = cx - ww / 2
    const y = bandTop + (TILE - bandTop - wh) * 0.45
    if (lit) {
      // A lit block: most windows are on, a few are dark — a fully lit slab reads as fake.
      const on = (c * 7 + 3) % 5 !== 0
      ctx.fillStyle = on ? '#ffd98a' : '#0a0a0a'
    } else {
      ctx.fillStyle = f.glass
    }
    ctx.fillRect(x, y, ww, wh)
    if (!lit) {
      ctx.strokeStyle = 'rgba(0,0,0,.28)' // reveal/frame
      ctx.lineWidth = 1
      ctx.strokeRect(x + 0.5, y + 0.5, ww - 1, wh - 1)
    }
  }
}

function makeTexture(kind: BuildingKind, lit: boolean): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = TILE
  const ctx = canvas.getContext('2d')!
  drawTile(ctx, FACADES[kind], lit)
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.magFilter = THREE.LinearFilter
  tex.anisotropy = 4
  return tex
}

export interface FacadeMaterials {
  /** One shared material per building class — six for the whole city. */
  of(kind: BuildingKind): THREE.MeshStandardMaterial
  /** Light the windows up after dusk. @param night 0..1 */
  setNight(night: number): void
  dispose(): void
}

/**
 * Facade materials, one per building class and shared by every building of that
 * class. Windows are a repeating procedural texture rather than geometry, so a
 * city's worth of them costs six textures and no extra triangles.
 */
export function createFacadeMaterials(): FacadeMaterials {
  const mats = new Map<BuildingKind, THREE.MeshStandardMaterial>()
  const kinds: BuildingKind[] = ['house', 'apartments', 'retail', 'office', 'industrial', 'civic']
  for (const k of kinds) {
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
