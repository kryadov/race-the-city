import type { Road, Vec2 } from '../geo/types'
import { getMinimapZoom, setMinimapZoom } from '../app/prefs'

const SIZE = 172 // minimap diameter in px
/** Zoom steps: world metres from centre to edge. Smaller = more zoomed in. */
const ZOOM_LEVELS = [420, 320, 260, 190, 130]
const OS_SCALE = 0.5 // offscreen px per metre

export interface Minimap {
  setWorld(roads: Road[], buildings: Vec2[][], water: Vec2[][], green: Vec2[][], radius: number): void
  /**
   * @param goal somewhere to head for — the next time-trial gate. Drawn on the
   *   rim when it's off the map, so it always says which way to go.
   */
  update(car: { x: number; z: number; heading: number }, goal?: Vec2 | null, goalColor?: string): void
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
    `position:absolute;top:16px;left:16px;width:${SIZE}px;height:${SIZE}px;` +
    'border-radius:50%;pointer-events:none;background:rgba(11,14,19,.6);box-shadow:0 4px 16px rgba(0,0,0,.4)'
  root.appendChild(canvas)
  const ctx = canvas.getContext('2d')!

  let offscreen: HTMLCanvasElement | null = null
  let radiusM = 1000

  const clampZoom = (i: number): number => Math.max(0, Math.min(ZOOM_LEVELS.length - 1, Math.round(i)))
  let zoom = clampZoom(getMinimapZoom())
  // The last frame's inputs, so the +/- buttons can redraw at once instead of
  // waiting for the loop's next update() (e.g. while paused).
  let lastCar: { x: number; z: number; heading: number } = { x: 0, z: 0, heading: 0 }
  let lastGoal: Vec2 | null = null
  let lastGoalColor: string | undefined

  // +/- buttons tucked into the minimap's bottom-right. The #ui root is
  // pointer-events:none, so the buttons opt back in; the box stays off so its
  // gaps don't swallow taps meant for the map.
  const BTN = 30
  const zoomBox = document.createElement('div')
  zoomBox.style.cssText =
    `position:absolute;top:${16 + SIZE - BTN * 2 - 6}px;left:${16 + SIZE - BTN - 2}px;` +
    'display:flex;flex-direction:column;gap:4px;pointer-events:none'
  root.appendChild(zoomBox)

  function nudgeZoom(delta: number): void {
    const next = clampZoom(zoom + delta)
    if (next === zoom) return
    zoom = next
    setMinimapZoom(zoom)
    api.update(lastCar, lastGoal, lastGoalColor) // redraw at the new scale right away
  }

  function makeZoomBtn(label: string, delta: number): void {
    const b = document.createElement('button')
    b.textContent = label
    b.style.cssText =
      `pointer-events:auto;width:${BTN}px;height:${BTN}px;border:0;border-radius:8px;padding:0;` +
      'background:rgba(11,14,19,.8);color:#fff;font:700 18px system-ui,sans-serif;line-height:1;' +
      'cursor:pointer;touch-action:manipulation'
    // pointerup covers mouse, touch and pen in one path; stopping it (and the
    // ghost click it spawns) keeps the tap from reaching the driving canvas.
    let byPointer = false
    const tap = (e: Event): void => {
      e.preventDefault()
      e.stopPropagation()
      nudgeZoom(delta)
    }
    b.addEventListener('pointerup', (e) => {
      byPointer = true
      tap(e)
    })
    b.addEventListener('click', (e) => {
      if (byPointer) {
        byPointer = false
        e.preventDefault()
        e.stopPropagation()
        return // pointerup already handled this tap
      }
      tap(e) // no Pointer Events (old browser): the click is the tap
    })
    zoomBox.appendChild(b)
  }
  makeZoomBtn('+', 1) // zoom in — show less ground
  makeZoomBtn('−', -1) // zoom out — show more ground

  function trace(g: CanvasRenderingContext2D, pts: Vec2[]): void {
    const p0 = regionToOffscreen(pts[0], radiusM)
    g.moveTo(p0.x, p0.y)
    for (let i = 1; i < pts.length; i++) {
      const p = regionToOffscreen(pts[i], radiusM)
      g.lineTo(p.x, p.y)
    }
  }

  const api: Minimap = {
    setWorld(roads, buildings, water, green, radius) {
      radiusM = radius
      const dim = Math.max(1, Math.round(2 * radius * OS_SCALE))
      const os = document.createElement('canvas')
      os.width = dim
      os.height = dim
      const g = os.getContext('2d')!

      g.fillStyle = 'rgba(76,122,66,.5)'
      for (const gp of green) {
        if (gp.length < 3) continue
        g.beginPath()
        trace(g, gp)
        g.closePath()
        g.fill()
      }

      g.fillStyle = 'rgba(47,109,176,.55)'
      for (const wp of water) {
        if (wp.length < 3) continue
        g.beginPath()
        trace(g, wp)
        g.closePath()
        g.fill()
      }

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

    update(car, goal, goalColor) {
      // Remember this frame so the +/- buttons can redraw without a new update().
      lastCar = car
      lastGoal = goal ?? null
      lastGoalColor = goalColor
      const viewRadius = ZOOM_LEVELS[zoom]
      ctx.clearRect(0, 0, SIZE, SIZE)
      const half = SIZE / 2
      if (offscreen) {
        const disp = half / (viewRadius * OS_SCALE)
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

      // Where to go next. The map turns with the car, so the marker turns with
      // it: bearing relative to the car's heading, with up being straight ahead.
      if (goal) {
        const dx = goal.x - car.x
        const dz = goal.z - car.z
        const dist = Math.hypot(dx, dz)
        const rel = Math.atan2(dz, dx) - car.heading
        // Screen coords: the map is rotated so the car's heading is up.
        const px = Math.sin(rel) * dist
        const py = -Math.cos(rel) * dist
        const disp = half / viewRadius
        let sx = px * disp
        let sy = py * disp
        const r = Math.hypot(sx, sy)
        const edge = half - 10
        const onRim = r > edge
        if (onRim) {
          // Off the map: pin it to the rim, so it still points the way.
          sx = (sx / r) * edge
          sy = (sy / r) * edge
        }
        ctx.save()
        ctx.translate(half + sx, half + sy)
        ctx.fillStyle = goalColor ?? '#39e07a'
        ctx.strokeStyle = 'rgba(0,0,0,.6)'
        ctx.lineWidth = 1.5
        if (onRim) {
          // An arrow, pointing at it.
          ctx.rotate(Math.atan2(sy, sx) + Math.PI / 2)
          ctx.beginPath()
          ctx.moveTo(0, -7)
          ctx.lineTo(5, 5)
          ctx.lineTo(-5, 5)
          ctx.closePath()
        } else {
          ctx.beginPath()
          ctx.arc(0, 0, 4.5, 0, Math.PI * 2)
        }
        ctx.fill()
        ctx.stroke()
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

      // compass letters rotating with the map (N in world is -z; east is +x)
      const theta = -Math.PI / 2 - car.heading
      const rr = half - 11
      ctx.font = '700 12px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const cardinals: Array<[string, number, number]> = [
        ['N', 0, -1],
        ['E', 1, 0],
        ['S', 0, 1],
        ['W', -1, 0],
      ]
      for (const [label, dx, dz] of cardinals) {
        const a = Math.atan2(dz, dx) + theta
        const px = half + Math.cos(a) * rr
        const py = half + Math.sin(a) * rr
        ctx.lineWidth = 3
        ctx.strokeStyle = 'rgba(0,0,0,.6)'
        ctx.strokeText(label, px, py)
        ctx.fillStyle = label === 'N' ? '#ff6b6b' : '#fff'
        ctx.fillText(label, px, py)
      }
    },
  }
  return api
}
