/** Small version badge in a screen corner, sourced from the build-time version. */
export function createVersionBadge(root: HTMLElement): void {
  const el = document.createElement('div')
  el.textContent = `v${__APP_VERSION__}`
  el.title = 'Race the City version'
  el.style.cssText =
    'position:absolute;bottom:10px;right:12px;color:rgba(255,255,255,.55);' +
    'font:12px system-ui,sans-serif;pointer-events:none;text-shadow:0 1px 2px rgba(0,0,0,.5)'
  root.appendChild(el)
}
