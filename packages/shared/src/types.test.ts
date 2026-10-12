import { describe, expect, it } from 'vitest'
import { FOUR, MODES, maxGuesses, wordLength } from './types.js'

describe('modes', () => {
  it('Four plays 5-letter words with 9 guesses', () => {
    expect(wordLength(FOUR)).toBe(5)
    expect(maxGuesses(FOUR)).toBe(9)
  })

  it('a word mode is its own length, with 6 guesses', () => {
    for (const mode of [5, 6, 7] as const) {
      expect(wordLength(mode)).toBe(mode)
      expect(maxGuesses(mode)).toBe(6)
    }
  })

  it('lists Four last in the switcher', () => {
    expect(MODES).toEqual([5, 6, 7, 4])
  })
})
