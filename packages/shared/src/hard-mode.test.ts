import { describe, expect, it } from 'vitest'
import { hardModeConstraints, isHardModeValid, type ScoredGuess } from './hard-mode.js'
import { scoreGuess } from './score.js'

/** Build a previous row the way the server would: guess plus its real marks. */
const row = (guess: string, answer: string): ScoredGuess => ({
  guess,
  marks: scoreGuess(guess, answer),
})

describe('isHardModeValid', () => {
  it('accepts anything when nothing has been revealed', () => {
    expect(isHardModeValid('crane', [])).toEqual({ valid: true })
  })

  describe('greens must stay', () => {
    const previous = [row('slate', 'stale')] // S correct at 0, E correct at 4

    it('rejects a guess that moves a revealed green', () => {
      expect(isHardModeValid('crane', previous)).toEqual({
        valid: false,
        reason: 'position',
        message: '1st letter must be S',
      })
    })

    it('names the earliest offending position', () => {
      // Keeps S at 0, drops E at 4.
      const result = isHardModeValid('shalt', previous)
      expect(result).toEqual({
        valid: false,
        reason: 'position',
        message: '5th letter must be E',
      })
    })

    it('accepts a guess that keeps every green in place', () => {
      expect(isHardModeValid('stale', previous)).toEqual({ valid: true })
    })
  })

  describe('yellows must be reused', () => {
    const previous = [row('crane', 'audit')] // A present at 2

    it('rejects a guess that omits a revealed yellow', () => {
      expect(isHardModeValid('spilt', previous)).toEqual({
        valid: false,
        reason: 'missing',
        message: 'Guess must contain A',
      })
    })

    it('accepts the yellow in any position, including the one it failed in', () => {
      expect(isHardModeValid('adult', previous)).toEqual({ valid: true })
      expect(isHardModeValid('brave', previous)).toEqual({ valid: true })
    })
  })

  describe('duplicate letters', () => {
    it('requires as many copies as a single row revealed', () => {
      // "eject" against "geese" proves two E: one yellow at 0, one green at 2.
      const previous = [row('eject', 'geese')]

      expect(isHardModeValid('bezel', previous)).toEqual({
        valid: false,
        reason: 'position',
        message: '3rd letter must be E',
      })

      // Third letter E, but only one E in total.
      expect(isHardModeValid('sheds', previous)).toEqual({
        valid: false,
        reason: 'missing',
        message: 'Guess must contain 2 Es',
      })

      expect(isHardModeValid('these', previous)).toEqual({ valid: true })
    })

    it('takes the maximum across rows, not the sum', () => {
      // Two separate rows each proving one E must not add up to two E.
      const previous = [row('crane', 'eight'), row('lemon', 'eight')]
      expect(hardModeConstraints(previous).minCount.get('e')).toBe(1)
      expect(isHardModeValid('there', previous)).toEqual({ valid: true })
      expect(isHardModeValid('every', previous)).toEqual({ valid: true })
    })

    it('does not require a copy that scored absent as a surplus', () => {
      // "eerie" vs "crane": only one E is real, the rest are absent.
      const previous = [row('eerie', 'crane')]
      expect(hardModeConstraints(previous).minCount.get('e')).toBe(1)
      expect(isHardModeValid('ridge', previous)).toEqual({ valid: true })
    })
  })

  it('still allows guessing letters already known to be absent', () => {
    // Hard mode constrains what you must keep, not what you may try.
    const previous = [row('crane', 'stilt')]
    expect(isHardModeValid('crane', previous)).toEqual({ valid: true })
  })

  it('checks greens before yellows so the message points at the position', () => {
    const previous = [row('slate', 'stale')]
    // "cramp" both moves the green S and omits nothing else usefully.
    const result = isHardModeValid('cramp', previous)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toBe('position')
  })

  it('is case-insensitive', () => {
    const previous = [row('slate', 'stale')]
    expect(isHardModeValid('STALE', previous)).toEqual({ valid: true })
  })
})

describe('hardModeConstraints', () => {
  it('merges greens and yellows across rows', () => {
    const previous = [row('slate', 'stale'), row('shale', 'stale')]
    const { fixed, minCount } = hardModeConstraints(previous)
    expect([...fixed.entries()].sort()).toEqual([
      [0, 's'],
      [2, 'a'],
      [3, 'l'],
      [4, 'e'],
    ])
    expect(minCount.get('t')).toBe(1)
  })
})
