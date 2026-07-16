export function createCityInput(root: HTMLElement, onSubmit: (query: string) => void): void {
  const bar = document.createElement('div')
  bar.style.cssText =
    'position:absolute;top:16px;left:50%;transform:translateX(-50%);' +
    'display:flex;gap:8px;pointer-events:auto;background:rgba(11,14,19,.8);' +
    'padding:8px;border-radius:10px'

  const input = document.createElement('input')
  input.placeholder = 'Город или "lat,lon"'
  input.value = 'Тбилиси'
  input.style.cssText = 'padding:8px 10px;border:0;border-radius:6px;font-size:14px;width:220px'

  const btn = document.createElement('button')
  btn.textContent = 'Поехали'
  btn.style.cssText = 'padding:8px 14px;border:0;border-radius:6px;background:#e63946;color:#fff;font-size:14px;cursor:pointer'

  const go = () => { if (input.value.trim()) onSubmit(input.value.trim()) }
  btn.addEventListener('click', go)
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go() })

  bar.append(input, btn)
  root.appendChild(bar)
}
