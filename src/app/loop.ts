export function startLoop(update: (dt: number) => void): () => void {
  let last = performance.now()
  let running = true
  const frame = (now: number) => {
    if (!running) return
    const dt = Math.min(0.05, (now - last) / 1000) // clamp to avoid huge steps
    last = now
    update(dt)
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
  return () => {
    running = false
  }
}
