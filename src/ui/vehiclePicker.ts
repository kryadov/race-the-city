import { t, onLangChange } from '../i18n/i18n'
import { VEHICLE_TYPES, type VehicleType } from '../vehicle/vehicles'

const EMOJI: Record<VehicleType, string> = { car: '🚗', truck: '🚚', sports: '🏎' }

export interface VehiclePickerHandle {
  setSelected(type: VehicleType): void
}

/** A small row of buttons to pick the vehicle; highlights the current one. */
export function createVehiclePicker(
  root: HTMLElement,
  onSelect: (type: VehicleType) => void,
  initial: VehicleType,
): VehiclePickerHandle {
  const bar = document.createElement('div')
  bar.style.cssText =
    'position:absolute;top:64px;left:50%;transform:translateX(-50%);' +
    'display:flex;gap:6px;pointer-events:auto;background:rgba(11,14,19,.7);' +
    'padding:6px;border-radius:10px'

  let selected = initial
  const buttons = new Map<VehicleType, HTMLButtonElement>()

  const paint = (): void => {
    for (const [type, btn] of buttons) {
      btn.textContent = `${EMOJI[type]} ${t('vehicle.' + type)}`
      btn.style.background = type === selected ? '#e63946' : '#26303f'
    }
  }

  for (const type of VEHICLE_TYPES) {
    const btn = document.createElement('button')
    btn.style.cssText = 'padding:6px 12px;border:0;border-radius:6px;color:#fff;font-size:14px;cursor:pointer'
    btn.addEventListener('click', () => {
      selected = type
      paint()
      onSelect(type)
    })
    buttons.set(type, btn)
    bar.appendChild(btn)
  }
  paint()
  root.appendChild(bar)

  onLangChange(paint)

  return {
    setSelected(type: VehicleType) {
      selected = type
      paint()
    },
  }
}
