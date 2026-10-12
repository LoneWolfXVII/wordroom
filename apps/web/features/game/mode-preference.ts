import { MODES, type Mode } from '@wordroom/shared'

const KEY = 'wordroom.mode'

/**
 * The game the player last picked, so a reload comes back to it.
 *
 * A preference, like the active room: losing it costs one tap. Every access is
 * wrapped, because Safari in private mode throws on `localStorage`.
 */
export function readModePreference(): Mode | null {
  try {
    const stored = Number(window.localStorage.getItem(KEY))
    return MODES.find((mode) => mode === stored) ?? null
  } catch {
    return null
  }
}

export function writeModePreference(mode: Mode): void {
  try {
    window.localStorage.setItem(KEY, String(mode))
  } catch {
    // Storage blocked or full: the next visit opens on the default.
  }
}
