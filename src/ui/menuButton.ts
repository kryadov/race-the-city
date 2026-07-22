import { cornerRight, CORNER_SIZE } from './cornerButtons'
import { t, onLangChange } from '../i18n/i18n'

/**
 * A ☰ button that opens the menu — slot 2 in the top-right row, after the pause
 * and the ? help button.
 *
 * On desktop the menu opens with Esc, but a phone has no Esc key and nothing else
 * reached the menu (settings, city, mode all live inside it), so there was no way
 * back to it at all on touch. This button is that way in, and it's harmless on
 * desktop. It sits in the game UI layer, under the menu overlay, so it shows in
 * play and is covered while the menu is open (you close the menu from its own
 * Resume/Play buttons).
 */
export function createMenuButton(root: HTMLElement, onOpen: () => void): void {
  const btn = document.createElement('button')
  btn.textContent = '☰'
  btn.dataset.role = 'openMenu'
  btn.style.cssText =
    `position:absolute;top:16px;right:${cornerRight(2)}px;pointer-events:auto;width:${CORNER_SIZE}px;height:${CORNER_SIZE}px;` +
    'border:0;border-radius:10px;background:rgba(11,14,19,.8);color:#fff;font-size:20px;cursor:pointer'
  const paint = (): void => {
    btn.title = t('menu.title')
  }
  paint()
  onLangChange(paint)
  btn.addEventListener('click', onOpen)
  root.appendChild(btn)
}
