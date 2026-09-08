import { describe, expect, it } from 'vitest'
import {
  type ClockInput,
  clampPerPuzzleSeconds,
  clockLabel,
  computeClock,
  formatClock,
  TIMEOUT_RETRY_MS,
  timeoutRetryDelayMs,
} from './timer'

/** See keys.test.mts for why these files are `.mts`. */

const START = 1_000_000

const base: ClockInput = {
  timerMode: 'off',
  perPuzzleSeconds: 180,
  startedAt: START,
  guessStartedAt: START,
  frozenMs: null,
  now: START,
}

describe('formatClock', () => {
  it('formats m:ss with a padded seconds field', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(9_000)).toBe('0:09')
    expect(formatClock(98_000)).toBe('1:38')
    expect(formatClock(600_000)).toBe('10:00')
  })

  it('never shows negative time', () => {
    expect(formatClock(-5_000)).toBe('0:00')
  })
})

describe('computeClock with the timer off', () => {
  it('still counts elapsed time but has no deadline', () => {
    const clock = computeClock({ ...base, now: START + 42_000 })
    expect(clock.elapsedMs).toBe(42_000)
    expect(clock.remainingMs).toBe(null)
    expect(clock.expired).toBe(false)
  })

  it('reads zero before the puzzle starts', () => {
    expect(computeClock({ ...base, startedAt: null }).elapsedMs).toBe(0)
  })
})

describe('computeClock in per-puzzle mode', () => {
  const perPuzzle: ClockInput = { ...base, timerMode: 'per-puzzle', perPuzzleSeconds: 180 }

  it('counts down from the limit', () => {
    expect(computeClock({ ...perPuzzle, now: START + 60_000 }).remainingMs).toBe(120_000)
  })

  it('turns urgent inside the last ten seconds, but not at exactly ten', () => {
    expect(computeClock({ ...perPuzzle, now: START + 170_000 }).urgent).toBe(false)
    expect(computeClock({ ...perPuzzle, now: START + 170_001 }).urgent).toBe(true)
  })

  it('expires the moment it hits zero, and stays expired past it', () => {
    expect(computeClock({ ...perPuzzle, now: START + 180_000 }).expired).toBe(true)
    expect(computeClock({ ...perPuzzle, now: START + 999_000 }).remainingMs).toBe(0)
  })

  it('is no longer urgent once it has run out', () => {
    expect(computeClock({ ...perPuzzle, now: START + 180_000 }).urgent).toBe(false)
  })

  it('cannot expire again once the attempt is finished', () => {
    // The result sheet can sit open for minutes; that is not a second timeout.
    const clock = computeClock({ ...perPuzzle, frozenMs: 45_000, now: START + 999_000 })
    expect(clock.expired).toBe(false)
    expect(clock.elapsedMs).toBe(45_000)
  })
})

describe('computeClock in per-guess mode', () => {
  const perGuess: ClockInput = { ...base, timerMode: 'per-guess' }

  it('allows twenty seconds measured from the current guess, not the puzzle', () => {
    const clock = computeClock({
      ...perGuess,
      startedAt: START,
      guessStartedAt: START + 100_000,
      now: START + 105_000,
    })
    expect(clock.remainingMs).toBe(15_000)
    // Elapsed still tracks the whole puzzle.
    expect(clock.elapsedMs).toBe(105_000)
  })
})

describe('computeClock in sprint mode', () => {
  it('is a stopwatch with no deadline', () => {
    const clock = computeClock({ ...base, timerMode: 'sprint', now: START + 30_000 })
    expect(clock.remainingMs).toBe(null)
    expect(clock.expired).toBe(false)
    expect(clock.elapsedMs).toBe(30_000)
  })
})

describe('clockLabel', () => {
  it('has no label at all when the timer is off', () => {
    expect(clockLabel(computeClock(base), 'off')).toBe(null)
  })

  it('shows what is left on a countdown', () => {
    const input: ClockInput = { ...base, timerMode: 'per-puzzle', now: START + 60_000 }
    expect(clockLabel(computeClock(input), 'per-puzzle')).toBe('2:00')
  })

  it('shows what has been spent on a sprint', () => {
    const input: ClockInput = { ...base, timerMode: 'sprint', now: START + 60_000 }
    expect(clockLabel(computeClock(input), 'sprint')).toBe('1:00')
  })
})

describe('clampPerPuzzleSeconds', () => {
  it('holds the custom range the spec allows', () => {
    expect(clampPerPuzzleSeconds(10)).toBe(30)
    expect(clampPerPuzzleSeconds(900)).toBe(600)
    expect(clampPerPuzzleSeconds(210)).toBe(210)
  })
})

describe('timeoutRetryDelayMs', () => {
  // A failed timeout returns the board to `playing` at zero, which re-arms the
  // same effect. Without spacing, the clock hook sent 1,611 timeout requests in
  // ten seconds while offline and froze the tab.
  it('sends the first timeout immediately', () => {
    expect(timeoutRetryDelayMs(null, START)).toBe(0)
  })

  it('waits out the retry interval after a failed attempt', () => {
    expect(timeoutRetryDelayMs(START, START)).toBe(TIMEOUT_RETRY_MS)
    expect(timeoutRetryDelayMs(START, START + 1_000)).toBe(TIMEOUT_RETRY_MS - 1_000)
  })

  it('is immediate again once the interval has passed', () => {
    expect(timeoutRetryDelayMs(START, START + TIMEOUT_RETRY_MS)).toBe(0)
    expect(timeoutRetryDelayMs(START, START + TIMEOUT_RETRY_MS * 10)).toBe(0)
  })
})
