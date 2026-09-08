import { describe, expect, it } from 'vitest'
import { computeStats } from './stats.js'
import type { Mode, StatAttempt } from './types.js'

const solve = (number: number, guessCount: number, mode: Mode = 5): StatAttempt => ({
  mode,
  number,
  solved: true,
  guessCount,
})

const fail = (number: number, mode: Mode = 5): StatAttempt => ({
  mode,
  number,
  solved: false,
  guessCount: 6,
})

describe('computeStats', () => {
  it('returns an empty shape when nothing has been played', () => {
    expect(computeStats([], 5)).toEqual({
      mode: 5,
      played: 0,
      won: 0,
      winPercent: 0,
      currentStreak: 0,
      maxStreak: 0,
      distribution: [0, 0, 0, 0, 0, 0],
    })
  })

  it('counts played, wins and win percentage', () => {
    const stats = computeStats([solve(1, 3), solve(2, 4), fail(3), solve(4, 2)], 5)
    expect(stats.played).toBe(4)
    expect(stats.won).toBe(3)
    expect(stats.winPercent).toBe(75)
  })

  it('buckets solves by guess count, one-indexed', () => {
    const stats = computeStats([solve(1, 1), solve(2, 4), solve(3, 4), solve(4, 6), fail(5)], 5)
    expect(stats.distribution).toEqual([1, 0, 0, 2, 0, 1])
  })

  describe('streaks', () => {
    it('counts consecutive solves', () => {
      const stats = computeStats([solve(1, 3), solve(2, 3), solve(3, 3)], 5)
      expect(stats.currentStreak).toBe(3)
      expect(stats.maxStreak).toBe(3)
    })

    it('breaks the streak on a fail', () => {
      const stats = computeStats([solve(1, 3), solve(2, 3), fail(3)], 5)
      expect(stats.currentStreak).toBe(0)
      expect(stats.maxStreak).toBe(2)
    })

    it('breaks the streak on a skipped puzzle number', () => {
      // 1, 2, 3 solved, No. 4 never played, then 5 solved.
      const stats = computeStats([solve(1, 3), solve(2, 3), solve(3, 3), solve(5, 3)], 5)
      expect(stats.currentStreak).toBe(1)
      expect(stats.maxStreak).toBe(3)
    })

    it('restarts after a fail and keeps the best run as the max', () => {
      const stats = computeStats(
        [solve(1, 3), solve(2, 3), solve(3, 3), fail(4), solve(5, 3), solve(6, 3)],
        5,
      )
      expect(stats.currentStreak).toBe(2)
      expect(stats.maxStreak).toBe(3)
    })

    it('keeps the current streak when the player simply has not played on', () => {
      const stats = computeStats([solve(9, 3), solve(10, 3)], 5)
      expect(stats.currentStreak).toBe(2)
      expect(stats.maxStreak).toBe(2)
    })

    it('is zero when the most recent puzzle was a fail, even after a long run', () => {
      const stats = computeStats([solve(1, 2), solve(2, 2), solve(3, 2), solve(4, 2), fail(5)], 5)
      expect(stats.currentStreak).toBe(0)
      expect(stats.maxStreak).toBe(4)
    })

    it('does not care about the order attempts arrive in', () => {
      const shuffled = [solve(3, 3), fail(1), solve(2, 4)]
      const stats = computeStats(shuffled, 5)
      expect(stats.currentStreak).toBe(2)
      expect(stats.maxStreak).toBe(2)
    })
  })

  describe('mode isolation', () => {
    it('ignores attempts from other modes entirely', () => {
      const attempts = [solve(1, 3, 5), solve(2, 3, 5), solve(1, 4, 6), fail(2, 6), solve(3, 5, 7)]

      const five = computeStats(attempts, 5)
      expect(five.played).toBe(2)
      expect(five.currentStreak).toBe(2)

      const six = computeStats(attempts, 6)
      expect(six.played).toBe(2)
      expect(six.won).toBe(1)
      expect(six.currentStreak).toBe(0)
      expect(six.maxStreak).toBe(1)

      const seven = computeStats(attempts, 7)
      expect(seven.played).toBe(1)
      expect(seven.currentStreak).toBe(1)
    })

    it('does not treat a gap filled by another mode as consecutive', () => {
      // No. 2 exists in mode 6 only; the 5-letter streak must still break.
      const attempts = [solve(1, 3, 5), solve(2, 3, 6), solve(3, 3, 5)]
      expect(computeStats(attempts, 5).maxStreak).toBe(1)
      expect(computeStats(attempts, 5).currentStreak).toBe(1)
    })
  })

  it('ignores a duplicate row for the same puzzle number', () => {
    const stats = computeStats([solve(1, 3), solve(1, 5), solve(2, 3)], 5)
    expect(stats.played).toBe(2)
    expect(stats.distribution).toEqual([0, 0, 2, 0, 0, 0])
  })
})
