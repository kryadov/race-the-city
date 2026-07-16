import * as THREE from 'three'
import type { Stage } from './scene'

export type ViewMode = 'day' | 'neon'

const DAY_BG = 0x9fc4e8
const NEON_BG = 0x05070d
const NEON_GROUND = 0x0a0f1a
const BUILDING_EDGE = 0x38f5ff
const ROAD_EDGE = 0xff5bd0
const EDGE_ANGLE = 20 // degrees: keep only significant edges (box corners, outlines)

export interface WorldRefs {
  ground: THREE.Mesh
  buildings: THREE.Object3D // group of building meshes
  roads: THREE.Object3D // single roads mesh
}

/**
 * Switches the whole scene between the lit "day" look and a wireframe "neon"
 * look. In neon mode solid building/road meshes are hidden and replaced by
 * glowing edge outlines, the ground is darkened, and the sky/fog go dark.
 * The world builders stay untouched — this only decorates what they produce.
 */
export class ThemeController {
  private mode: ViewMode = 'day'
  private world: WorldRefs | null = null
  private edges: THREE.LineSegments[] = []
  private edgesBuilt = false
  private readonly dayGroundColor = new THREE.Color()

  /** Called after every mode change so the UI can reflect the current view. */
  onChange: ((mode: ViewMode) => void) | null = null

  constructor(private readonly stage: Stage) {}

  get current(): ViewMode {
    return this.mode
  }

  /** Attach a freshly built world; drops the previous neon edges and reapplies. */
  setWorld(world: WorldRefs): void {
    this.disposeEdges()
    this.edgesBuilt = false
    this.world = world
    this.dayGroundColor.copy((world.ground.material as THREE.MeshStandardMaterial).color)
    if (this.mode === 'neon') this.buildEdges()
    this.apply()
  }

  toggle(): void {
    this.set(this.mode === 'day' ? 'neon' : 'day')
  }

  set(mode: ViewMode): void {
    this.mode = mode
    if (mode === 'neon' && !this.edgesBuilt) this.buildEdges()
    this.apply()
  }

  /** Lazily generate glowing edge outlines for the current world's meshes. */
  private buildEdges(): void {
    if (!this.world || this.edgesBuilt) return
    const addEdges = (root: THREE.Object3D, color: number): void => {
      root.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (!mesh.geometry) return
        // Building/road geometry is baked in world space with an identity mesh
        // transform, so the line can be added straight to the scene.
        const line = new THREE.LineSegments(
          new THREE.EdgesGeometry(mesh.geometry, EDGE_ANGLE),
          new THREE.LineBasicMaterial({ color }),
        )
        line.visible = false
        this.stage.scene.add(line)
        this.edges.push(line)
      })
    }
    addEdges(this.world.buildings, BUILDING_EDGE)
    addEdges(this.world.roads, ROAD_EDGE)
    this.edgesBuilt = true
  }

  private disposeEdges(): void {
    for (const line of this.edges) {
      this.stage.scene.remove(line)
      line.geometry.dispose()
      ;(line.material as THREE.Material).dispose()
    }
    this.edges = []
  }

  private apply(): void {
    const neon = this.mode === 'neon'
    const bg = neon ? NEON_BG : DAY_BG
    ;(this.stage.scene.background as THREE.Color).setHex(bg)
    if (this.stage.scene.fog) (this.stage.scene.fog as THREE.Fog).color.setHex(bg)

    if (this.world) {
      this.world.buildings.visible = !neon
      this.world.roads.visible = !neon
      const groundMat = this.world.ground.material as THREE.MeshStandardMaterial
      if (neon) groundMat.color.setHex(NEON_GROUND)
      else groundMat.color.copy(this.dayGroundColor)
    }
    for (const line of this.edges) line.visible = neon

    this.onChange?.(this.mode)
  }
}
