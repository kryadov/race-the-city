import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import { ThemeController } from '../../src/app/theme'
import type { Stage } from '../../src/app/scene'

const DAY_BG = 0x9fc4e8
const NEON_BG = 0x05070d
const NEON_GROUND = 0x0a0f1a
const DAY_GROUND = 0x5a7d4f

function makeStage(): { stage: Stage; scene: THREE.Scene } {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(DAY_BG)
  scene.fog = new THREE.Fog(DAY_BG, 300, 900)
  // ThemeController only touches stage.scene; the rest can be dummies.
  const stage = { scene, camera: null, renderer: null, carMesh: null } as unknown as Stage
  return { stage, scene }
}

function makeWorld() {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.MeshStandardMaterial({ color: DAY_GROUND, flatShading: true }),
  )
  const buildings = new THREE.Group()
  buildings.add(
    new THREE.Mesh(new THREE.BoxGeometry(2, 3, 2), new THREE.MeshStandardMaterial()),
    new THREE.Mesh(new THREE.BoxGeometry(2, 3, 2), new THREE.MeshStandardMaterial()),
  )
  const roads = new THREE.Mesh(new THREE.PlaneGeometry(20, 4), new THREE.MeshStandardMaterial())
  // greenery + road detail are instanced groups, neon-styled by material
  const greenery = new THREE.Group()
  greenery.add(new THREE.InstancedMesh(new THREE.ConeGeometry(1, 2, 6), new THREE.MeshStandardMaterial({ color: 0x2f7d3b }), 4))
  const roadDetail = new THREE.Group()
  roadDetail.add(new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.1, 4), new THREE.MeshStandardMaterial({ color: 0x9a9ea6 }), 4))
  const streetFurniture = new THREE.Group()
  streetFurniture.add(new THREE.InstancedMesh(new THREE.BoxGeometry(1.7, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0x565a5f }), 3))
  const poiMarkers = new THREE.Group()
  poiMarkers.add(new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.07, 2.2, 6), new THREE.MeshStandardMaterial({ color: 0x8b8e94 }), 2))
  return { ground, buildings, roads, greenery, roadDetail, streetFurniture, poiMarkers }
}

const lineCount = (scene: THREE.Scene) =>
  scene.children.filter((o): o is THREE.LineSegments => o instanceof THREE.LineSegments)

describe('ThemeController', () => {
  it('starts in day mode with solids shown and no edge lines', () => {
    const { stage, scene } = makeStage()
    const theme = new ThemeController(stage)
    const world = makeWorld()
    theme.setWorld(world)

    expect(theme.current).toBe('day')
    expect(world.buildings.visible).toBe(true)
    expect(world.roads.visible).toBe(true)
    expect((scene.background as THREE.Color).getHex()).toBe(DAY_BG)
    expect(lineCount(scene).length).toBe(0) // edges are lazy — not built until neon
  })

  it('switches to neon: hides solids, darkens ground/sky, shows glowing edges', () => {
    const { stage, scene } = makeStage()
    const theme = new ThemeController(stage)
    const world = makeWorld()
    theme.setWorld(world)

    theme.toggle()

    expect(theme.current).toBe('neon')
    expect(world.buildings.visible).toBe(false)
    expect(world.roads.visible).toBe(false)
    expect((world.ground.material as THREE.MeshStandardMaterial).color.getHex()).toBe(NEON_GROUND)
    expect((scene.background as THREE.Color).getHex()).toBe(NEON_BG)

    const lines = lineCount(scene)
    // 2 building meshes + 1 roads mesh => 3 edge overlays, all visible
    expect(lines.length).toBe(3)
    expect(lines.every((l) => l.visible)).toBe(true)
  })

  it('neon-styles instanced greenery/road detail (wireframe + emissive) and restores on day', () => {
    const { stage } = makeStage()
    const theme = new ThemeController(stage)
    const world = makeWorld()
    theme.setWorld(world)
    const treeMat = (world.greenery.children[0] as THREE.InstancedMesh).material as THREE.MeshStandardMaterial
    const dayEmissive = treeMat.emissive.getHex()

    theme.toggle() // neon
    expect(treeMat.wireframe).toBe(true)
    expect(treeMat.emissive.getHex()).not.toBe(dayEmissive)

    theme.toggle() // day
    expect(treeMat.wireframe).toBe(false)
    expect(treeMat.emissive.getHex()).toBe(dayEmissive)
  })

  it('switches back to day: restores solids, ground color, sky, hides edges', () => {
    const { stage, scene } = makeStage()
    const theme = new ThemeController(stage)
    const world = makeWorld()
    theme.setWorld(world)

    theme.toggle() // neon
    theme.toggle() // day again

    expect(theme.current).toBe('day')
    expect(world.buildings.visible).toBe(true)
    expect(world.roads.visible).toBe(true)
    expect((world.ground.material as THREE.MeshStandardMaterial).color.getHex()).toBe(DAY_GROUND)
    expect((scene.background as THREE.Color).getHex()).toBe(DAY_BG)
    expect(lineCount(scene).every((l) => !l.visible)).toBe(true)
  })

  it('notifies onChange with the new mode', () => {
    const { stage } = makeStage()
    const theme = new ThemeController(stage)
    const onChange = vi.fn()
    theme.onChange = onChange
    theme.setWorld(makeWorld())

    onChange.mockClear()
    theme.toggle()
    expect(onChange).toHaveBeenLastCalledWith('neon')
    theme.toggle()
    expect(onChange).toHaveBeenLastCalledWith('day')
  })

  const NEON_HERO = 0xffffff
  const NEON_BOT = 0xff8a3d

  function mover(scene: THREE.Scene, tag: 'hero' | 'bot', mat: THREE.MeshStandardMaterial): THREE.Group {
    const g = new THREE.Group()
    g.userData.neonMover = tag
    g.add(new THREE.Mesh(new THREE.BoxGeometry(2, 1, 4), mat))
    scene.add(g)
    return g
  }

  it('flips a flagged bot mover to wireframe + amber in neon, and restores it on day', () => {
    const { stage, scene } = makeStage()
    const theme = new ThemeController(stage)
    theme.setWorld(makeWorld())
    const botMat = new THREE.MeshStandardMaterial({ color: 0x334455 })
    const dayEmissive = botMat.emissive.getHex()
    mover(scene, 'bot', botMat)

    theme.toggle() // neon
    expect(botMat.wireframe).toBe(true)
    expect(botMat.emissive.getHex()).toBe(NEON_BOT)

    theme.toggle() // day
    expect(botMat.wireframe).toBe(false)
    expect(botMat.emissive.getHex()).toBe(dayEmissive)
  })

  it('glows the hero (player car) a distinct white from the amber bots', () => {
    const { stage, scene } = makeStage()
    const theme = new ThemeController(stage)
    theme.setWorld(makeWorld())
    const heroMat = new THREE.MeshStandardMaterial({ color: 0x808080 })
    mover(scene, 'hero', heroMat)

    theme.toggle() // neon
    expect(heroMat.emissive.getHex()).toBe(NEON_HERO)
    expect(NEON_HERO).not.toBe(NEON_BOT)
  })

  it('refreshMovers flips a mover that arrives (car swap / crowd rebuild) while already in neon', () => {
    const { stage, scene } = makeStage()
    const theme = new ThemeController(stage)
    theme.setWorld(makeWorld())
    theme.set('neon')

    // a fresh, day-styled mover drops in after we're already in neon
    const mat = new THREE.MeshStandardMaterial({ color: 0x223344 })
    mover(scene, 'bot', mat)
    expect(mat.wireframe, 'flipped before we asked').toBe(false)

    theme.refreshMovers()
    expect(mat.wireframe).toBe(true)
    expect(mat.emissive.getHex()).toBe(NEON_BOT)
  })

  it('leaves unflagged scene objects (no neonMover) alone', () => {
    const { stage, scene } = makeStage()
    const theme = new ThemeController(stage)
    theme.setWorld(makeWorld())
    const mat = new THREE.MeshStandardMaterial({ color: 0x111111 })
    const plain = new THREE.Group()
    plain.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat))
    scene.add(plain)

    theme.toggle() // neon
    expect(mat.wireframe).toBe(false)
  })

  it('reapplies neon to a newly loaded world (edges rebuilt, solids hidden)', () => {
    const { stage, scene } = makeStage()
    const theme = new ThemeController(stage)
    theme.setWorld(makeWorld())
    theme.set('neon')
    expect(lineCount(scene).length).toBe(3)

    // Load a different world while in neon: old edges dropped, new ones built.
    const world2 = makeWorld()
    theme.setWorld(world2)
    expect(theme.current).toBe('neon')
    expect(world2.buildings.visible).toBe(false)
    expect(lineCount(scene).length).toBe(3)
  })
})
