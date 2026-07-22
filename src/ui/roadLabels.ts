import * as THREE from 'three'
import type { NamedPlace, Road } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import type { DeckIndex } from '../world/bridge'

const MAX_DIST = 220 // metres from the car to show a label
const MAX_LABELS = 14 // cap concurrently drawn labels
const LABEL_UP = 1 // metres above the surface the name floats
const ROAD_COLOR = '#fff'
const WATER_COLOR = '#bfe3ff' // a soft blue, so a river name reads as water, not a street

interface Label {
  name: string
  pos: THREE.Vector3
  color: string
}

export interface RoadLabels {
  setWorld(roads: Road[], provider: ElevationProvider, decks?: DeckIndex, waterNames?: NamedPlace[]): void
  setEnabled(on: boolean): void
  update(camera: THREE.Camera, carX: number, carZ: number): void
}

/**
 * How high a road's name floats. A bridge road's name rides its DECK — the
 * carriageway you actually drive — not the terrain far below it, which is where
 * reading the ground provider left it (floating under the deck). Everything else
 * sits on the terrain as before. Pure/testable.
 */
export function labelHeight(
  road: Road,
  x: number,
  z: number,
  provider: ElevationProvider,
  decks?: DeckIndex,
): number {
  const deck = road.bridge ? decks?.heightAt(x, z) ?? null : null
  return (deck ?? provider.heightAt(x, z)) + LABEL_UP
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
    setWorld(roads, provider, decks, waterNames = []) {
      const byName = new Map<string, Label>()
      for (const road of roads) {
        if (!road.name || road.points.length < 2 || byName.has(road.name)) continue
        const mid = road.points[Math.floor(road.points.length / 2)]
        byName.set(road.name, {
          name: road.name,
          pos: new THREE.Vector3(mid.x, labelHeight(road, mid.x, mid.z, provider, decks), mid.z),
          color: ROAD_COLOR,
        })
      }
      // River/lake names float over the water at their anchor (a soft blue so they
      // read as water). A road of the same name wins the slot — the street you
      // drive is the one you want named.
      for (const w of waterNames) {
        if (byName.has(w.name)) continue
        byName.set(w.name, {
          name: w.name,
          pos: new THREE.Vector3(w.at.x, provider.heightAt(w.at.x, w.at.z) + LABEL_UP, w.at.z),
          color: WATER_COLOR,
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
        ctx.fillStyle = l.color
        ctx.fillText(l.name, sx, sy)
      }
    },
  }
}
