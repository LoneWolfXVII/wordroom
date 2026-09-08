import { DEFAULT_PLAYER_SETTINGS, type PlayerSettings, type TimerMode } from '@wordroom/shared'

/**
 * Timer rules, from spec v1 "Timer".
 *
 * Off by default; per player, never per room. Per-puzzle presets are 1/2/3/5
 * minutes with a custom value from 0:30 to 10:00 in 30-second steps, defaulting
 * to 3:00.
 */
export const MIN_PER_PUZZLE_SECONDS = 30
export const MAX_PER_PUZZLE_SECONDS = 600
export const PER_PUZZLE_STEP_SECONDS = 30
export const DEFAULT_PER_PUZZLE_SECONDS = 180

/** `.chips` — 1:00 / 2:00 / 3:00 / 5:00, then Custom. */
export const PER_PUZZLE_PRESETS = [60, 120, 180, 300] as const

/** The per-guess clock is fixed at 20 seconds; there is nothing to configure. */
export const PER_GUESS_SECONDS = 20

/** Sprint is the fastest five solves, so it has no per-puzzle limit either. */
export const SPRINT_SOLVES = 5

const TIMER_MODES: readonly TimerMode[] = ['off', 'per-puzzle', 'per-guess', 'sprint']

export function isTimerMode(value: unknown): value is TimerMode {
  return typeof value === 'string' && (TIMER_MODES as readonly string[]).includes(value)
}

/** `180 -> "3:00"`, `20 -> "0:20"`. */
export function formatSeconds(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/**
 * Snap a custom per-puzzle limit onto the 30-second grid inside 0:30-10:00.
 *
 * The stepper can only ever produce legal values, but a number that came back
 * from `players.settings` was written by some earlier build of this app and is
 * not to be trusted.
 */
export function clampPerPuzzleSeconds(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PER_PUZZLE_SECONDS
  const snapped = Math.round(value / PER_PUZZLE_STEP_SECONDS) * PER_PUZZLE_STEP_SECONDS
  return Math.min(MAX_PER_PUZZLE_SECONDS, Math.max(MIN_PER_PUZZLE_SECONDS, snapped))
}

/**
 * Read `players.settings` — a `jsonb` column, so genuinely `unknown` — into a
 * `PlayerSettings`. Every field falls back to its default independently, so one
 * bad key does not reset a player's whole configuration.
 */
export function normalizeSettings(value: unknown): PlayerSettings {
  if (value === null || typeof value !== 'object') return { ...DEFAULT_PLAYER_SETTINGS }

  const raw = value as Record<string, unknown>
  const rawSeconds = raw.perPuzzleSeconds

  return {
    timerMode: isTimerMode(raw.timerMode) ? raw.timerMode : DEFAULT_PLAYER_SETTINGS.timerMode,
    perPuzzleSeconds:
      typeof rawSeconds === 'number'
        ? clampPerPuzzleSeconds(rawSeconds)
        : DEFAULT_PLAYER_SETTINGS.perPuzzleSeconds,
    hardMode: typeof raw.hardMode === 'boolean' ? raw.hardMode : DEFAULT_PLAYER_SETTINGS.hardMode,
  }
}

/** True when the custom stepper should be showing rather than a preset chip. */
export function isCustomPerPuzzle(seconds: number): boolean {
  return !(PER_PUZZLE_PRESETS as readonly number[]).includes(seconds)
}

/** The one-line description of a timer setting, for a hint or the board header. */
export function timerSummary(settings: PlayerSettings): string {
  switch (settings.timerMode) {
    case 'off':
      return 'Off'
    case 'per-puzzle':
      return `${formatSeconds(settings.perPuzzleSeconds)} per puzzle`
    case 'per-guess':
      return `${PER_GUESS_SECONDS}s per guess`
    case 'sprint':
      return `Sprint — fastest ${SPRINT_SOLVES} solves`
  }
}

/** Two settings are the same configuration. Used to decide if a save is needed. */
export function settingsEqual(a: PlayerSettings, b: PlayerSettings): boolean {
  return (
    a.timerMode === b.timerMode &&
    a.hardMode === b.hardMode &&
    // The per-puzzle limit is only part of the configuration when it is in use.
    (a.timerMode !== 'per-puzzle' || a.perPuzzleSeconds === b.perPuzzleSeconds)
  )
}
