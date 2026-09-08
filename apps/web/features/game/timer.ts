import type { TimerMode } from '@wordroom/shared'

/**
 * The clock, as pure arithmetic.
 *
 * Nothing here holds an interval or reads `Date.now()` — the caller passes
 * `now`, so every branch (including a timeout landing exactly on zero) is
 * testable without waiting for real time to pass.
 */

/** Per-guess mode allows 20 seconds a guess. Spec v1, "Timer". */
export const PER_GUESS_SECONDS = 20

/** Per-puzzle custom range: 0:30 to 10:00 in 30s steps, default 3:00. */
export const PER_PUZZLE_MIN_SECONDS = 30
export const PER_PUZZLE_MAX_SECONDS = 600
export const PER_PUZZLE_STEP_SECONDS = 30

/** Under ten seconds the countdown turns accent-coloured, as in the prototype. */
export const URGENT_MS = 10_000

/** How often the clock repaints. Fine enough for whole seconds, cheap enough to ignore. */
export const TICK_MS = 250

/**
 * The least time between two attempts to report a timeout to the server.
 *
 * A timeout that fails — no connection, a 429, a cold function that dropped the
 * request — puts the board back to `playing` with the clock still at zero,
 * which is the exact state that asked for the timeout in the first place. With
 * nothing between the two, the clock hook re-fired the request the moment the
 * previous one failed: offline, that was a request and a toast every few
 * milliseconds until the network came back. Three seconds is short enough that
 * a recovered connection finishes the puzzle promptly and long enough that a
 * dead one costs a toast every few seconds rather than a storm.
 */
export const TIMEOUT_RETRY_MS = 3_000

/**
 * How long to wait before (re)sending a timeout, given when the last one was
 * sent. The first attempt is immediate; a retry waits out `TIMEOUT_RETRY_MS`.
 */
export function timeoutRetryDelayMs(lastAttemptAt: number | null, now: number): number {
  if (lastAttemptAt === null) return 0
  return Math.max(0, TIMEOUT_RETRY_MS - (now - lastAttemptAt))
}

export interface ClockInput {
  timerMode: TimerMode
  /** Seconds allowed per puzzle when `timerMode` is `per-puzzle`. */
  perPuzzleSeconds: number
  /** Epoch ms when the puzzle started, or null before the first guess window opens. */
  startedAt: number | null
  /** Epoch ms when the current guess window opened. Only used by `per-guess`. */
  guessStartedAt: number | null
  /** Elapsed time frozen at the moment the attempt finished, or null while playing. */
  frozenMs: number | null
  now: number
}

export interface Clock {
  /** Time spent on this puzzle so far. Counts up in every mode, including `off`. */
  elapsedMs: number
  /** Time left in the current window, or null when nothing is counting down. */
  remainingMs: number | null
  /** True the moment a countdown hits zero on an unfinished attempt. */
  expired: boolean
  /** True while a countdown is inside its last ten seconds. */
  urgent: boolean
}

/**
 * The length of the window a countdown is measured over, and when it started.
 *
 * `per-puzzle` counts down from the start of the puzzle; `per-guess` restarts
 * with every accepted guess. `sprint` is a stopwatch across five solves and
 * `off` is not a clock at all, so neither has a deadline.
 */
function window(input: ClockInput): { startedAt: number; limitMs: number } | null {
  switch (input.timerMode) {
    case 'per-puzzle': {
      if (input.startedAt === null) return null
      return { startedAt: input.startedAt, limitMs: input.perPuzzleSeconds * 1000 }
    }
    case 'per-guess': {
      if (input.guessStartedAt === null) return null
      return { startedAt: input.guessStartedAt, limitMs: PER_GUESS_SECONDS * 1000 }
    }
    case 'sprint':
    case 'off':
      return null
  }
}

export function computeClock(input: ClockInput): Clock {
  const running = input.startedAt === null ? 0 : Math.max(0, input.now - input.startedAt)
  const elapsedMs = input.frozenMs ?? running

  const deadline = window(input)
  if (deadline === null) {
    return { elapsedMs, remainingMs: null, expired: false, urgent: false }
  }

  const spent = Math.max(0, input.now - deadline.startedAt)
  const remainingMs = Math.max(0, deadline.limitMs - spent)

  return {
    elapsedMs,
    remainingMs,
    // A finished attempt cannot time out again, however long the sheet sits open.
    expired: remainingMs === 0 && input.frozenMs === null,
    urgent: remainingMs > 0 && remainingMs < URGENT_MS,
  }
}

/** `m:ss`, rounded to the nearest second. Used by the header clock and by share text. */
export function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

/**
 * What the line under the puzzle number reads.
 *
 * A countdown shows what is left; a sprint shows what has been spent; with the
 * timer off there is no clock, and the caller writes the room name there instead.
 */
export function clockLabel(clock: Clock, timerMode: TimerMode): string | null {
  if (timerMode === 'off') return null
  if (clock.remainingMs !== null) return formatClock(clock.remainingMs)
  return formatClock(clock.elapsedMs)
}

/** Clamp a custom per-puzzle limit to the range the spec allows. */
export function clampPerPuzzleSeconds(seconds: number): number {
  return Math.min(PER_PUZZLE_MAX_SECONDS, Math.max(PER_PUZZLE_MIN_SECONDS, Math.round(seconds)))
}
