// Vitest, and deliberately `.mts`.
//
// `apps/web` has no Vitest runner yet — its `test` script is a stub and the
// package has no `vitest` dependency — and `apps/web/package.json` belongs to
// another workstream, so workstream 4 cannot add one. `tsconfig.json` includes
// `**/*.ts`, which would fail on the import below; it does not match `.mts`.
//
// These specs are real and run today against any Vitest in the workspace. Once
// `vitest` is a dependency of this package, rename this file back to `.ts` so
// it is typechecked with the rest of the app.
import { DEFAULT_PLAYER_SETTINGS, type PlayerSettings } from '@wordroom/shared'
import { describe, expect, it } from 'vitest'
import {
  clampPerPuzzleSeconds,
  formatSeconds,
  isCustomPerPuzzle,
  isTimerMode,
  MAX_PER_PUZZLE_SECONDS,
  MIN_PER_PUZZLE_SECONDS,
  normalizeSettings,
  PER_PUZZLE_PRESETS,
  settingsEqual,
  timerSummary,
} from './settings'

describe('timer bounds', () => {
  it('matches the spec: 0:30 to 10:00, default 3:00', () => {
    expect(MIN_PER_PUZZLE_SECONDS).toBe(30)
    expect(MAX_PER_PUZZLE_SECONDS).toBe(600)
    expect(DEFAULT_PLAYER_SETTINGS.perPuzzleSeconds).toBe(180)
  })

  it('is off by default', () => {
    expect(DEFAULT_PLAYER_SETTINGS.timerMode).toBe('off')
  })
})

describe('clampPerPuzzleSeconds', () => {
  it('holds legal values', () => {
    expect(clampPerPuzzleSeconds(180)).toBe(180)
    expect(clampPerPuzzleSeconds(30)).toBe(30)
    expect(clampPerPuzzleSeconds(600)).toBe(600)
  })

  it('snaps to the 30-second grid', () => {
    expect(clampPerPuzzleSeconds(100)).toBe(90)
    expect(clampPerPuzzleSeconds(105)).toBe(120)
  })

  it('clamps beyond the ends', () => {
    expect(clampPerPuzzleSeconds(0)).toBe(30)
    expect(clampPerPuzzleSeconds(-90)).toBe(30)
    expect(clampPerPuzzleSeconds(9_999)).toBe(600)
  })

  it('falls back on a non-number', () => {
    expect(clampPerPuzzleSeconds(Number.NaN)).toBe(180)
    expect(clampPerPuzzleSeconds(Number.POSITIVE_INFINITY)).toBe(180)
  })
})

describe('formatSeconds', () => {
  it('reads as a clock', () => {
    expect(formatSeconds(30)).toBe('0:30')
    expect(formatSeconds(60)).toBe('1:00')
    expect(formatSeconds(180)).toBe('3:00')
    expect(formatSeconds(600)).toBe('10:00')
  })
})

describe('isTimerMode', () => {
  it('accepts the four modes and nothing else', () => {
    expect(isTimerMode('off')).toBe(true)
    expect(isTimerMode('per-puzzle')).toBe(true)
    expect(isTimerMode('per-guess')).toBe(true)
    expect(isTimerMode('sprint')).toBe(true)
    expect(isTimerMode('puzzle')).toBe(false)
    expect(isTimerMode(3)).toBe(false)
    expect(isTimerMode(null)).toBe(false)
  })
})

describe('normalizeSettings', () => {
  it('round-trips a valid row', () => {
    const stored: PlayerSettings = { timerMode: 'per-guess', perPuzzleSeconds: 300, hardMode: true }
    expect(normalizeSettings(stored)).toEqual(stored)
  })

  it('falls back field by field rather than resetting everything', () => {
    expect(normalizeSettings({ timerMode: 'nope', perPuzzleSeconds: 300, hardMode: true })).toEqual(
      {
        timerMode: 'off',
        perPuzzleSeconds: 300,
        hardMode: true,
      },
    )
  })

  it('repairs an out-of-range limit written by an older build', () => {
    expect(
      normalizeSettings({ timerMode: 'per-puzzle', perPuzzleSeconds: 5, hardMode: false }),
    ).toEqual({ timerMode: 'per-puzzle', perPuzzleSeconds: 30, hardMode: false })
  })

  it('returns the defaults for junk', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_PLAYER_SETTINGS)
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_PLAYER_SETTINGS)
    expect(normalizeSettings('off')).toEqual(DEFAULT_PLAYER_SETTINGS)
    expect(normalizeSettings({})).toEqual(DEFAULT_PLAYER_SETTINGS)
  })

  it('does not hand back the shared default object', () => {
    const normalized = normalizeSettings(null)
    normalized.hardMode = true
    expect(DEFAULT_PLAYER_SETTINGS.hardMode).toBe(false)
  })
})

describe('isCustomPerPuzzle', () => {
  it('is false for each preset chip', () => {
    for (const preset of PER_PUZZLE_PRESETS) {
      expect(isCustomPerPuzzle(preset)).toBe(false)
    }
  })

  it('is true for a stepper value between presets', () => {
    expect(isCustomPerPuzzle(90)).toBe(true)
    expect(isCustomPerPuzzle(600)).toBe(true)
  })
})

describe('timerSummary', () => {
  it('describes each mode in one line', () => {
    expect(timerSummary({ timerMode: 'off', perPuzzleSeconds: 180, hardMode: false })).toBe('Off')
    expect(timerSummary({ timerMode: 'per-puzzle', perPuzzleSeconds: 90, hardMode: false })).toBe(
      '1:30 per puzzle',
    )
    expect(timerSummary({ timerMode: 'per-guess', perPuzzleSeconds: 180, hardMode: false })).toBe(
      '20s per guess',
    )
    expect(timerSummary({ timerMode: 'sprint', perPuzzleSeconds: 180, hardMode: false })).toBe(
      'Sprint — fastest 5 solves',
    )
  })
})

describe('settingsEqual', () => {
  const base: PlayerSettings = { timerMode: 'per-puzzle', perPuzzleSeconds: 180, hardMode: false }

  it('sees a changed limit while per-puzzle is in use', () => {
    expect(settingsEqual(base, { ...base, perPuzzleSeconds: 300 })).toBe(false)
  })

  it('ignores the limit when the timer is off, so no needless write happens', () => {
    const off: PlayerSettings = { ...base, timerMode: 'off' }
    expect(settingsEqual(off, { ...off, perPuzzleSeconds: 300 })).toBe(true)
  })

  it('sees a hard-mode change', () => {
    expect(settingsEqual(base, { ...base, hardMode: true })).toBe(false)
  })
})
