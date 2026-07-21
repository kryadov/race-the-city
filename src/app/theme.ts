import * as THREE from 'three'
import type { Stage } from './scene'

export type ViewMode = 'day' | 'neon'

const DAY_BG = 0x9fc4e8
const NEON_BG = 0x05070d
const NEON_GROUND = 0x0a0f1a
const BUILDING_EDGE = 0x38f5ff
const ROAD_EDGE = 0xff5bd0
const NEON_TREE = 0x1dd85f // greenery glows green in neon
const NEON_DETAIL = 0xffb13b // lamps/signs glow amber in neon
const NEON_CROP = 0xe8c33a // standing crop, stubble and hay bales glow warm gold
const NEON_PITCH = 0x39e08a // sports pitches — surface, markings and goals glow green
const NEON_ARCH = 0x38f5ff // archway frames over road passages glow like the buildings they cut through
const NEON_HERO = 0xffffff // the player car glows white — it's you, and it stands out
const NEON_BOT = 0xff8a3d // every other mover (traffic, buses, bikes, walkers, trains…) glows warm amber
const EDGE_ANGLE = 20 // degrees: keep only significant edges (box corners, outlines)

/** How a mover flags itself so neon finds and flips it — `group.userData.neonMover = 'bot'`. */
export type NeonMover = 'hero' | 'bot'

/** A material's day values, stashed so neon can be undone even after the mover is rebuilt. */
interface MoverDay {
  wire: boolean
  emissive: number
  emissiveI: number
}

export interface WorldRefs {
  ground: THREE.Mesh
  buildings: THREE.Object3D // group of building meshes
  roads: THREE.Object3D // single roads mesh
  greenery: THREE.Object3D // trees (instanced) — neon-styled by material, not edges
  roadDetail: THREE.Object3D // lamps/signs/lane lines (instanced) — same
  streetFurniture: THREE.Object3D // benches, bus stops + seated figures (instanced) — same
  poiMarkers: THREE.Object3D // café / fuel signposts (instanced) — same
  /** Standing crop / stubble / hay bales (instanced) — static world, so flipped by
   *  material here rather than the live mover scan. Optional: a city may have no field. */
  crops?: THREE.Object3D
  /** Sports pitches: green surface, white markings, goals/hoops, figures — static
   *  world, flipped by material here too. Optional: a city may have no pitch. */
  pitches?: THREE.Object3D
  /** Stone gate frames stood over roads that cut through a building — static world,
   *  one merged mesh, flipped by material here. Optional: a city may have no crossing. */
  archways?: THREE.Object3D
}

/** A material we recolour for neon, plus its day values to restore. */
interface NeonMat {
  mat: THREE.MeshStandardMaterial
  target: number
  wire: boolean
  emissive: number
  emissiveI: number
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
  private neonMats: NeonMat[] = []
  private readonly dayGroundColor = new THREE.Color()
  // Movers (the player car and every bot) are rebuilt as you swap vehicle or
  // change city, so we can't cache their materials the way we do the static
  // world. Instead we find them fresh each toggle by their userData flag and
  // stash each material's day values here, keyed weakly so a disposed mover's
  // entry falls away with it.
  private readonly moverDay = new WeakMap<THREE.MeshStandardMaterial, MoverDay>()

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
    this.collectNeonMats(world)
    if (this.mode === 'neon') this.buildEdges()
    this.apply()
  }

  /**
   * Trees and road furniture are instanced, so edge-outlines can't replicate
   * per instance. Instead we flip their materials to a glowing neon wireframe.
   * Record each material's day values here so they can be restored.
   */
  private collectNeonMats(world: WorldRefs): void {
    this.neonMats = []
    const collect = (root: THREE.Object3D, target: number): void => {
      const seen = new Set<THREE.Material>()
      root.traverse((o) => {
        const m = (o as THREE.Mesh).material
        if (!m) return
        for (const mat of Array.isArray(m) ? m : [m]) {
          if (!(mat instanceof THREE.MeshStandardMaterial) || seen.has(mat)) continue
          seen.add(mat)
          this.neonMats.push({
            mat,
            target,
            wire: mat.wireframe,
            emissive: mat.emissive.getHex(),
            emissiveI: mat.emissiveIntensity,
          })
        }
      })
    }
    collect(world.greenery, NEON_TREE)
    collect(world.roadDetail, NEON_DETAIL)
    collect(world.streetFurniture, NEON_DETAIL)
    collect(world.poiMarkers, NEON_DETAIL)
    if (world.crops) collect(world.crops, NEON_CROP)
    if (world.pitches) collect(world.pitches, NEON_PITCH)
    if (world.archways) collect(world.archways, NEON_ARCH)
  }

  /**
   * Flip the dynamic movers — the player car and every bot (traffic, buses,
   * bikes, cyclists, pedestrians, trains, boats, livestock) — to match the
   * current view. They aren't in `WorldRefs` because they're rebuilt as you
   * swap vehicle or change city; each flags itself with `userData.neonMover`
   * and we find it by scanning the scene's top-level children live. In neon
   * their materials go glowing wireframe (like the instanced world furniture);
   * off neon their stashed day values are restored.
   */
  private styleMovers(neon: boolean): void {
    for (const root of this.stage.scene.children) {
      const tag = root.userData.neonMover as NeonMover | undefined
      if (!tag) continue
      const color = tag === 'hero' ? NEON_HERO : NEON_BOT
      const seen = new Set<THREE.Material>()
      root.traverse((o) => {
        const m = (o as THREE.Mesh).material
        if (!m) return
        for (const mat of Array.isArray(m) ? m : [m]) {
          if (!(mat instanceof THREE.MeshStandardMaterial) || seen.has(mat)) continue
          seen.add(mat)
          if (neon) {
            if (!this.moverDay.has(mat)) {
              this.moverDay.set(mat, { wire: mat.wireframe, emissive: mat.emissive.getHex(), emissiveI: mat.emissiveIntensity })
            }
            mat.wireframe = true
            mat.emissive.setHex(color)
            mat.emissiveIntensity = 1
          } else {
            const day = this.moverDay.get(mat)
            if (day) {
              mat.wireframe = day.wire
              mat.emissive.setHex(day.emissive)
              mat.emissiveIntensity = day.emissiveI
              this.moverDay.delete(mat)
            }
          }
        }
      })
    }
  }

  /**
   * Re-flip the movers to the current mode. Call after a car swap or a crowd
   * rebuild puts fresh, day-styled movers in the scene while neon is on — they'd
   * otherwise stay solid until the next toggle.
   */
  refreshMovers(): void {
    this.styleMovers(this.mode === 'neon')
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
    for (const e of this.neonMats) {
      if (neon) {
        e.mat.wireframe = true
        e.mat.emissive.setHex(e.target)
        e.mat.emissiveIntensity = 1
      } else {
        e.mat.wireframe = e.wire
        e.mat.emissive.setHex(e.emissive)
        e.mat.emissiveIntensity = e.emissiveI
      }
    }
    this.styleMovers(neon)

    this.onChange?.(this.mode)
  }
}
