import * as THREE from 'three'
import type { Road } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'

const MAX_DIST = 220 // metres from the car to show a label
const MAX_LABELS = 14 // cap concurrently drawn labels

interface Label {
  name: string
  pos: THREE.Vector3
}

export interface RoadLabels {
  setWorld(roads: Road[], provider: ElevationProvider): void
  setEnabled(on: boolean): void
  update(camera: THREE.Camera, carX: number, carZ: number): void
}

/** Transparent full-screen overlay drawing street names projected from the camera. */
export function createRoadLabels(root: HTMLElement): RoadLabels {
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none'
  root.appendChild(canvas)
  const ctx = canvas.getContext('2d')!

  const resize = (): void => {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
  }
  resize()
  window.addEventListener('resize', resize)

  let labels: Label[] = []
  let enabled = false
  const ndc = new THREE.Vector3()

  return {
    setWorld(roads, provider) {
      const byName = new Map<string, Label>()
      for (const road of roads) {
        if (!road.name || road.points.length < 2 || byName.has(road.name)) continue
        const mid = road.points[Math.floor(road.points.length / 2)]
        byName.set(road.name, {
          name: road.name,
          pos: new THREE.Vector3(mid.x, provider.heightAt(mid.x, mid.z) + 1, mid.z),
        })
      }
      labels = [...byName.values()]
    },

    setEnabled(on) {
      enabled = on
      if (!on) ctx.clearRect(0, 0, canvas.width, canvas.height)
    },

    update(camera, carX, carZ) {
      if (!enabled) return
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)
      ctx.font = '600 13px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      const near = labels
        .map((l) => ({ l, d: Math.hypot(l.pos.x - carX, l.pos.z - carZ) }))
        .filter((e) => e.d < MAX_DIST)
        .sort((a, b) => a.d - b.d)
        .slice(0, MAX_LABELS)

      for (const { l } of near) {
        ndc.copy(l.pos).project(camera)
        if (ndc.z > 1 || Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1) continue // behind or off-screen
        const sx = (ndc.x * 0.5 + 0.5) * w
        const sy = (1 - (ndc.y * 0.5 + 0.5)) * h
        ctx.lineWidth = 3
        ctx.strokeStyle = 'rgba(0,0,0,.7)'
        ctx.strokeText(l.name, sx, sy)
        ctx.fillStyle = '#fff'
        ctx.fillText(l.name, sx, sy)
      }
    },
  }
}
