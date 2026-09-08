/**
 * Per-player settings: timer modes and hard mode, persisted to
 * `players.settings`.
 *
 * Workstream 2 wants `useActiveSettings()` for the rules in force on the current
 * puzzle, and `applyPendingSettings()` once per puzzle as the next one loads.
 */

export { BuildStamp } from './build-stamp'
export {
  clampPerPuzzleSeconds,
  DEFAULT_PER_PUZZLE_SECONDS,
  formatSeconds,
  isCustomPerPuzzle,
  isTimerMode,
  MAX_PER_PUZZLE_SECONDS,
  MIN_PER_PUZZLE_SECONDS,
  normalizeSettings,
  PER_GUESS_SECONDS,
  PER_PUZZLE_PRESETS,
  PER_PUZZLE_STEP_SECONDS,
  SPRINT_SOLVES,
  settingsEqual,
  timerSummary,
} from './settings'
export { SettingsSheet, type SettingsSheetProps } from './settings-sheet'
export { createSettingsSource, type SettingsSource } from './source'
export {
  applyPendingSettings,
  useActiveSettings,
  usePendingSettings,
  useSettingsConnection,
  useSettingsStore,
} from './use-settings'
