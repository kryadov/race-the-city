import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createBirds } from '../../src/app/birds'

/** Every instance's world position, read back out of the InstancedMesh. */
function positions(mesh: THREE.InstancedMesh): THREE.Vector3[] {
  const out: THREE.Vector3[] = []
  const m = new THREE.Matrix4()
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m)
    out.push(new THREE.Vector3().setFromMatrixPosition(m))
  }
  return out
}

function quatAt(mesh: THREE.InstancedMesh, i: number): THREE.Quaternion {
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  mesh.getMatrixAt(i, m)
  m.decompose(new THREE.Vector3(), q, new THREE.Vector3())
  return q
}

/** Deterministic PRNG (mulberry32), for tests that want a diverse but
 *  reproducible flock rather than every bird rolling the same values. */
function makeRand(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * The chase camera as syncCamera (scene.ts) builds it: behind and above a car
 * at the origin facing +x, at the default camDist/camDistScale of 1 — back=14,
 * up=7, looking at car.y+1.5. Reused to build a real view frustum, so
 * "visible" here means the same thing it means on screen.
 */
function chaseCamera(): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(65, 16 / 9, 0.5, 2000)
  cam.position.set(-14, 7, 0)
  cam.lookAt(0, 1.5, 0)
  cam.updateMatrixWorld(true)
  return cam
}

function frustumOf(cam: THREE.PerspectiveCamera): THREE.Frustum {
  cam.updateProjectionMatrix()
  const m = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)
  return new THREE.Frustum().setFromProjectionMatrix(m)
}

describe('birds', () => {
  it('flies a flock, not a mesh per bird', () => {
    const scene = new THREE.Scene()
    createBirds(scene, () => 0.5, 6)
    const group = scene.children[0] as THREE.Group
    // one instanced draw per wing side, however many birds there are
    expect(group.children.length).toBe(2)
    const wing = group.children[0] as THREE.InstancedMesh
    expect(wing.count).toBe(6)
  })

  it('perches, later leaves, and comes back down — a full flight, not a hover', () => {
    const scene = new THREE.Scene()
    const b = createBirds(scene, () => 0.5, 1)
    const wing = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh

    const ys: number[] = []
    for (let i = 0; i < 450; i++) {
      b.update(0.1, 0, 0)
      ys.push(positions(wing)[0].y)
    }

    // Starts down (perched) rather than already airborne.
    for (const y of ys.slice(0, 40)) expect(y).toBeLessThan(6)
    // At some point during the run it actually flies, well above rooftop height.
    expect(Math.max(...ys), 'the bird never left its perch').toBeGreaterThan(12)
    // And by the end it has come back down and settled again.
    for (const y of ys.slice(-20)) expect(y).toBeLessThan(6)
  })

  it('crosses the map on a leg, rather than orbiting one point overhead', () => {
    const scene = new THREE.Scene()
    const b = createBirds(scene, () => 0.5, 1)
    const wing = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh

    let maxReach = 0
    for (let i = 0; i < 420; i++) {
      b.update(0.1, 0, 0)
      const p = positions(wing)[0]
      maxReach = Math.max(maxReach, Math.hypot(p.x, p.z))
    }
    // The old design orbited a leashed centre and never got past leash(110) +
    // orbit radius(26) =~ 136m from the camera. A straight cruise leg goes
    // well past that.
    expect(maxReach, 'never got far from the camera — that is an orbit, not a transit').toBeGreaterThan(140)
  })

  it('flaps while flying, and holds its wings still while perched', () => {
    const scene = new THREE.Scene()
    const b = createBirds(scene, () => 0.5, 1)
    const group = scene.children[0] as THREE.Group
    const right = group.children[0] as THREE.InstancedMesh
    const left = group.children[1] as THREE.InstancedMesh

    // Frames 10 and 30 are still well inside the initial perch (see the
    // flight-timing test above): the wing must not move at all.
    let stillBefore: THREE.Quaternion | null = null
    for (let i = 1; i <= 40; i++) {
      b.update(0.1, 0, 0)
      if (i === 10) stillBefore = quatAt(right, 0)
      if (i === 30) {
        const stillAfter = quatAt(right, 0)
        expect(stillAfter.angleTo(stillBefore!), 'wings moved while perched').toBeLessThan(1e-6)
      }
    }

    // Frames 120 and 170 land inside the cruise leg: the wing must be moving,
    // and both wings must move (a real wingbeat is symmetric).
    let flyingBefore: THREE.Quaternion | null = null
    for (let i = 41; i <= 170; i++) {
      b.update(0.1, 0, 0)
      if (i === 120) flyingBefore = quatAt(right, 0)
    }
    const flyingAfter = quatAt(right, 0)
    expect(flyingAfter.angleTo(flyingBefore!), 'the wing never moved in flight').toBeGreaterThan(0.01)
    const leftAfter = quatAt(left, 0)
    expect(leftAfter.angleTo(flyingAfter), 'only one wing flapped').toBeGreaterThan(0.01)
  })

  it('comes down on a nearby tree when one is offered', () => {
    const scene = new THREE.Scene()
    const provider = { heightAt: () => 0 }
    // A single tree, close enough to the camera's anchor to be found.
    const perches = [{ x: 20, z: 0 }]
    const b = createBirds(scene, () => 0.5, 1, provider, perches)
    const wing = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh

    let sawCanopyHeight = false
    for (let i = 0; i < 450; i++) {
      b.update(0.1, 0, 0)
      const p = positions(wing)[0]
      // Landed height matches TREE_PERCH_H (4.5) above the ground the tree
      // stands on, not GROUND_PERCH_H (0.3) — proof it used the tree, not
      // bare ground, at least once during the run.
      if (p.y > 3 && p.y < 6 && Math.hypot(p.x - 20, p.z) < 6) sawCanopyHeight = true
    }
    expect(sawCanopyHeight, 'never settled at tree-canopy height near the only tree offered').toBe(true)
  })

  it('comes down on a rooftop when one is offered and no tree is closer', () => {
    const scene = new THREE.Scene()
    const provider = { heightAt: () => 0 }
    const ROOF_Y = 12
    // A roof spanning the whole area the flock moves in, and no trees at all.
    const roofAt = (): number | null => ROOF_Y
    const b = createBirds(scene, () => 0.5, 1, provider, [], roofAt)
    const wing = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh

    let sawRoofHeight = false
    for (let i = 0; i < 450; i++) {
      b.update(0.1, 0, 0)
      const p = positions(wing)[0]
      // ROOF_PERCH_H (0.3) above the roof, not TREE_PERCH_H (4.5) above it
      // and not sitting on bare ground at y≈0.3.
      if (Math.abs(p.y - (ROOF_Y + 0.3)) < 0.5) sawRoofHeight = true
    }
    expect(sawRoofHeight, 'never settled at rooftop height with a roof under the whole flight area').toBe(true)
  })

  it('is within the chase camera\'s view at some point — the whole reason for this rework', () => {
    const cam = chaseCamera()
    const frustum = frustumOf(cam)
    const scene = new THREE.Scene()
    // A diverse, still-deterministic flock: every bird rolling the same
    // value (as the other tests do for exact predictability) would fly one
    // single path, understating how often a real flock crosses the view.
    const rand = makeRand(12345)
    const b = createBirds(scene, rand, 8)
    const wing = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh

    // birds.update is fed the camera's own position, exactly as main.ts does
    // (stage.camera.position.x/z) — not the car's.
    let framesVisible = 0
    const totalFrames = 900 // 90s: several full flights per bird
    for (let i = 0; i < totalFrames; i++) {
      b.update(0.1, cam.position.x, cam.position.z)
      for (const p of positions(wing)) {
        if (frustum.containsPoint(p)) {
          framesVisible++
          break
        }
      }
    }
    expect(framesVisible, 'not one frame in 90s had a bird on screen').toBeGreaterThan(0)
  })

  it('keeps a departing wave loosely grouped, not scattered across the map', () => {
    const scene = new THREE.Scene()
    const rand = makeRand(777)
    const b = createBirds(scene, rand, 8)
    const wing = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh

    // Sample the flock's own spread (not distance from camera) throughout a
    // run: whatever state each bird is in, they should still read as one
    // flock rather than eight independent birds.
    let maxSpreadSeen = 0
    for (let i = 0; i < 400; i++) {
      b.update(0.1, 0, 0)
      const pts = positions(wing)
      let maxD = 0
      for (let a = 0; a < pts.length; a++)
        for (let c = a + 1; c < pts.length; c++) maxD = Math.max(maxD, pts[a].distanceTo(pts[c]))
      maxSpreadSeen = Math.max(maxSpreadSeen, maxD)
    }
    expect(maxSpreadSeen, 'a flock this spread out reads as loners, not a flock').toBeLessThan(110)
  })

  it('keeps pace with a long, steady drive — the flock is not abandoned behind the player', () => {
    // Unlike the old orbiting flock, a bird mid-leg is genuinely flying a
    // fixed line and won't teleport to stay glued to the camera every single
    // frame — that is the whole point of giving it somewhere to be. What
    // must still hold is the weaker, real guarantee: landings keep re-aiming
    // at the (leashed, camera-chasing) anchor, so periodically — not every
    // frame, but repeatedly — some bird comes down close to the player,
    // rather than the whole flock being left behind at the old position for
    // the rest of the drive.
    const scene = new THREE.Scene()
    const rand = makeRand(555)
    const b = createBirds(scene, rand, 8)
    const wing = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh
    let camX = 0
    const SPEED = 25 // m/s — a plausible driving speed, not a stress-test speed
    let everClose = Infinity
    for (let step = 0; step < 1200; step++) {
      camX += SPEED * 0.1
      b.update(0.1, camX, 0)
      if (step > 300) {
        // once the flock has had time to settle into its rhythm
        const closest = Math.min(...positions(wing).map((p) => Math.hypot(p.x - camX, p.z)))
        everClose = Math.min(everClose, closest)
      }
    }
    expect(everClose, 'not once did a bird land anywhere near the camera during the drive').toBeLessThan(250)
  })

  it('is already there on the first frame, not flying in from the map origin', () => {
    const scene = new THREE.Scene()
    const b = createBirds(scene, () => 0.5, 6)
    const wing = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh
    b.update(0.016, 4000, -4000)
    for (const p of positions(wing)) {
      expect(Math.hypot(p.x - 4000, p.z + 4000)).toBeLessThan(200)
    }
  })

  it('recovers from a jump in the camera position, not just a steady drive', () => {
    // A city change teleports the camera. A bird already perched or mid-leg
    // can't teleport with it — real birds don't — but the flock as a whole
    // must not be abandoned at the old city forever: give it a couple of
    // minutes to cycle through a flight, and it should be back near the
    // player.
    const scene = new THREE.Scene()
    const rand = makeRand(31)
    const b = createBirds(scene, rand, 8)
    const wing = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh
    for (let i = 0; i < 50; i++) b.update(0.1, 0, 0)
    for (let i = 0; i < 1200; i++) b.update(0.1, 9000, 9000)
    const closest = Math.min(...positions(wing).map((p) => Math.hypot(p.x - 9000, p.z - 9000)))
    expect(closest, 'the flock never made it back near the player after the jump').toBeLessThan(300)
  })

  it('goes away when switched off', () => {
    const scene = new THREE.Scene()
    const b = createBirds(scene, () => 0.5, 4)
    b.update(0.1, 0, 0)
    b.setEnabled(false)
    expect((scene.children[0] as THREE.Group).visible).toBe(false)
    b.setEnabled(true)
    expect((scene.children[0] as THREE.Group).visible).toBe(true)
  })

  it('takes itself off the scene when the city changes', () => {
    const scene = new THREE.Scene()
    const b = createBirds(scene, () => 0.5, 4)
    expect(scene.children.length).toBe(1)
    b.dispose()
    expect(scene.children.length, 'birds from the old city must not pile up').toBe(0)
  })

  it('is deterministic given the same rand function', () => {
    const s1 = new THREE.Scene()
    const s2 = new THREE.Scene()
    const b1 = createBirds(s1, () => 0.42, 5)
    const b2 = createBirds(s2, () => 0.42, 5)
    for (let i = 0; i < 40; i++) {
      b1.update(0.1, 30, -10)
      b2.update(0.1, 30, -10)
    }
    const w1 = (s1.children[0] as THREE.Group).children[0] as THREE.InstancedMesh
    const w2 = (s2.children[0] as THREE.Group).children[0] as THREE.InstancedMesh
    const flat = (arr: THREE.Vector3[]): number[][] => arr.map((p) => [p.x, p.y, p.z])
    expect(flat(positions(w1))).toEqual(flat(positions(w2)))
  })

  it('survives a flock of one', () => {
    const scene = new THREE.Scene()
    const b = createBirds(scene, () => 0.5, 1)
    expect(() => {
      for (let i = 0; i < 100; i++) b.update(0.1, 0, 0)
    }).not.toThrow()
  })
})
