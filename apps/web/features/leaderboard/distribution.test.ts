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
import { computeStats, type StatAttempt } from '@wordroom/shared'
import { describe, expect, it } from 'vitest'
import { distributionBars } from './distribution'
import { formatAverage, formatClock } from './format'

function solve(number: number, guessCount: number): StatAttempt {
  return { mode: 5, number, solved: true, guessCount }
}

describe('distributionBars', () => {
  it('always has one bar per allowed guess', () => {
    const bars = distributionBars(computeStats([], 5))
    expect(bars.map((bar) => bar.guesses)).toEqual([1, 2, 3, 4, 5, 6])
    expect(bars.every((bar) => bar.count === 0)).toBe(true)
  })

  it('scales the tallest bar to the full track', () => {
    const stats = computeStats([solve(1, 3), solve(2, 3), solve(3, 3), solve(4, 5)], 5)
    const bars = distributionBars(stats)

    expect(bars[2]?.count).toBe(3)
    expect(bars[2]?.percent).toBe(100)
    expect(bars[4]?.count).toBe(1)
    expect(bars[4]?.percent).toBeCloseTo(40)
  })

  it('leaves an empty bar a readable stub rather than nothing', () => {
    const bars = distributionBars(computeStats([solve(1, 2)], 5))
    expect(bars[0]?.percent).toBe(10)
    expect(bars[1]?.percent).toBe(100)
  })

  it('gives every bar the same stub when the player has never solved', () => {
    const stats = computeStats([{ mode: 5, number: 1, solved: false, guessCount: 6 }], 5)
    const bars = distributionBars(stats)
    expect(bars.every((bar) => bar.percent === 10)).toBe(true)
    expect(stats.played).toBe(1)
    expect(stats.won).toBe(0)
  })

  it('highlights only the row for the puzzle just solved', () => {
    const stats = computeStats([solve(1, 4), solve(2, 2)], 5)
    const bars = distributionBars(stats, 4)
    expect(bars.filter((bar) => bar.highlighted).map((bar) => bar.guesses)).toEqual([4])
  })

  it('highlights nothing when the sheet is opened outside a result', () => {
    const bars = distributionBars(computeStats([solve(1, 4)], 5), null)
    expect(bars.some((bar) => bar.highlighted)).toBe(false)
  })

  it('ignores attempts from another mode, as computeStats does', () => {
    const attempts: StatAttempt[] = [
      solve(1, 2),
      { mode: 6, number: 1, solved: true, guessCount: 5 },
    ]
    const bars = distributionBars(computeStats(attempts, 5))
    expect(bars[4]?.count).toBe(0)
  })
})

describe('formatAverage', () => {
  it('shows one decimal place', () => {
    expect(formatAverage(3.44, 9)).toBe('3.4 avg')
    expect(formatAverage(4, 1)).toBe('4.0 avg')
  })

  it('does not claim a 0.0 average before the first solve', () => {
    expect(formatAverage(0, 0)).toBe('— avg')
  })
})

describe('formatClock', () => {
  it('matches the share text format', () => {
    expect(formatClock(98_000)).toBe('1:38')
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(600_000)).toBe('10:00')
  })
})
