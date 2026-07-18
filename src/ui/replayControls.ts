import { t, onLangChange } from '../i18n/i18n'

export interface ReplayControls {
  set(state: { recording: boolean; playing: boolean; hasClip: boolean; duration: number }): void
  setVisible(on: boolean): void
}

export interface ReplayCallbacks {
  onRecordToggle: () => void
  onPlay: () => void
  onStopPlay: () => void
}

const fmt = (s: number): string => {
  const m = Math.floor(s / 60)
  return `${m}:${Math.floor(s - m * 60).toString().padStart(2, '0')}`
}

/** Record / replay buttons, bottom-centre. Record your drive, then watch it back. */
export function createReplayControls(root: HTMLElement, cb: ReplayCallbacks): ReplayControls {
  const bar = document.createElement('div')
  // #ui is pointer-events:none; opt back in or the buttons can't be clicked.
  bar.style.cssText =
    'position:absolute;bottom:16px;left:50%;transform:translateX(-50%);z-index:20;display:none;gap:8px;' +
    'pointer-events:auto;font:14px system-ui,sans-serif'

  const rec = document.createElement('button')
  const play = document.createElement('button')
  for (const b of [rec, play]) {
    b.style.cssText =
      'padding:9px 14px;border:0;border-radius:20px;color:#fff;cursor:pointer;font-size:14px;' +
      'background:rgba(20,26,38,.85);box-shadow:0 3px 12px rgba(0,0,0,.4)'
  }
  rec.onclick = () => cb.onRecordToggle()
  play.onclick = () => (playing ? cb.onStopPlay() : cb.onPlay())
  bar.append(rec, play)
  root.appendChild(bar)

  let playing = false
  let state = { recording: false, playing: false, hasClip: false, duration: 0 }

  const paint = (): void => {
    playing = state.playing
    if (state.recording) {
      rec.textContent = `● ${fmt(state.duration)}`
      rec.style.background = '#c0303a'
    } else {
      rec.textContent = `● ${t('replay.rec')}`
      rec.style.background = 'rgba(20,26,38,.85)'
    }
    if (state.playing) {
      play.textContent = `■ ${t('replay.stop')}`
      play.style.opacity = '1'
      play.style.cursor = 'pointer'
    } else {
      play.textContent = `▶ ${t('replay.replay')}`
      const usable = state.hasClip && !state.recording
      play.style.opacity = usable ? '1' : '.45'
      play.style.cursor = usable ? 'pointer' : 'default'
      play.disabled = !usable
    }
  }
  onLangChange(paint)

  return {
    set(s) {
      state = s
      paint()
    },
    setVisible(on) {
      bar.style.display = on ? 'flex' : 'none'
    },
  }
}
