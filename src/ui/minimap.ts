import type { Road, Vec2 } from '../geo/types'

const SIZE = 172 // minimap diameter in px
const VIEW_RADIUS = 260 // world metres from centre to edge
const OS_SCALE = 0.5 // offscreen px per metre

export interface Minimap {
  setWorld(roads: Road[], buildings: Vec2[][], radius: number): void
  update(car: { x: number; z: number; heading: number }): void
}

/** World point → pixel in the pre-rendered north-up offscreen map. Pure/testable. */
export function regionToOffscreen(v: Vec2, radius: number): { x: number; y: number } {
  return { x: (v.x + radius) * OS_SCALE, y: (v.z + radius) * OS_SCALE }
}

/**
 * A rotating 2D minimap: the loaded roads/buildings are drawn once to an
 * offscreen north-up canvas; each frame it's drawn rotated and centred so the
 * car (a triangle) always points up.
 */
export function createMinimap(root: HTMLElement): Minimap {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  canvas.style.cssText =
    `position:absolute;bottom:16px;left:16px;width:${SIZE}px;height:${SIZE}px;` +
    'border-radius:50%;pointer-events:none;background:rgba(11,14,19,.6);box-shadow:0 4px 16px rgba(0,0,0,.4)'
  root.appendChild(canvas)
  const ctx = canvas.getContext('2d')!

  let offscreen: HTMLCanvasElement | null = null
  let radiusM = 1000

  function trace(g: CanvasRenderingContext2D, pts: Vec2[]): void {
    const p0 = regionToOffscreen(pts[0], radiusM)
    g.moveTo(p0.x, p0.y)
    for (let i = 1; i < pts.length; i++) {
      const p = regionToOffscreen(pts[i], radiusM)
      g.lineTo(p.x, p.y)
    }
  }

  return {
    setWorld(roads, buildings, radius) {
      radiusM = radius
      const dim = Math.max(1, Math.round(2 * radius * OS_SCALE))
      const os = document.createElement('canvas')
      os.width = dim
      os.height = dim
      const g = os.getContext('2d')!

      g.fillStyle = 'rgba(120,140,160,.28)'
      for (const fp of buildings) {
        if (fp.length < 3) continue
        g.beginPath()
        trace(g, fp)
        g.closePath()
        g.fill()
      }

      g.strokeStyle = 'rgba(215,215,225,.75)'
      g.lineWidth = 1.5
      g.lineJoin = 'round'
      for (const road of roads) {
        if (road.points.length < 2) continue
        g.beginPath()
        trace(g, road.points)
        g.stroke()
      }
      offscreen = os
    },

    update(car) {
      ctx.clearRect(0, 0, SIZE, SIZE)
      const half = SIZE / 2
      if (offscreen) {
        const disp = half / (VIEW_RADIUS * OS_SCALE)
        const carOff = regionToOffscreen({ x: car.x, z: car.z }, radiusM)
        ctx.save()
        ctx.beginPath()
        ctx.arc(half, half, half, 0, Math.PI * 2)
        ctx.clip()
        ctx.translate(half, half)
        ctx.rotate(-Math.PI / 2 - car.heading) // car forward → up
        ctx.scale(disp, disp)
        ctx.translate(-carOff.x, -carOff.y)
        ctx.drawImage(offscreen, 0, 0)
        ctx.restore()
      }

      // car marker at centre, pointing up
      ctx.save()
      ctx.translate(half, half)
      ctx.fillStyle = '#e63946'
      ctx.beginPath()
      ctx.moveTo(0, -7)
      ctx.lineTo(5, 6)
      ctx.lineTo(-5, 6)
      ctx.closePath()
      ctx.fill()
      ctx.restore()

      ctx.strokeStyle = 'rgba(255,255,255,.25)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(half, half, half - 1, 0, Math.PI * 2)
      ctx.stroke()
    },
  }
}
