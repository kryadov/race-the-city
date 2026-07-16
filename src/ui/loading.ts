export function createLoading(root: HTMLElement): { show(msg: string): void; error(msg: string): void; hide(): void } {
  const box = document.createElement('div')
  box.style.cssText =
    'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
    'background:rgba(11,14,19,.85);color:#fff;padding:16px 22px;border-radius:10px;' +
    'font-size:15px;pointer-events:none;display:none;max-width:80vw;text-align:center'
  root.appendChild(box)
  return {
    show(msg) { box.style.display = 'block'; box.style.color = '#fff'; box.textContent = msg },
    error(msg) { box.style.display = 'block'; box.style.color = '#ff8080'; box.textContent = msg },
    hide() { box.style.display = 'none' },
  }
}
