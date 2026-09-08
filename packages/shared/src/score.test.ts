import { describe, expect, it } from 'vitest'
import { isSolved, marksToSquares, scoreGuess } from './score.js'

const s = (guess: string, answer: string) => scoreGuess(guess, answer).join(' ')

describe('scoreGuess', () => {
  it('marks an exact match all correct', () => {
    expect(s('crane', 'crane')).toBe('correct correct correct correct correct')
  })

  it('marks a fully disjoint guess all absent', () => {
    expect(s('milky', 'crest')).toBe('absent absent absent absent absent')
  })

  it('mixes correct, present and absent', () => {
    // S and E land in place; L and T are both in the answer, swapped.
    expect(s('slate', 'stale')).toBe('correct present correct present correct')
  })

  describe('duplicate letters', () => {
    it('gives leftover copies to present, left to right', () => {
      // "abbey" has two B; guess "bobby" has three. Position 2 takes a green,
      // the first B takes the one spare, the last B has nothing left.
      expect(s('bobby', 'abbey')).toBe('present absent correct absent correct')
    })

    it('lets a green claim the only copy before any yellow can', () => {
      // "crane" has a single E, already spent on the green at index 4.
      expect(s('eerie', 'crane')).toBe('absent absent present absent correct')
    })

    it('handles a guess with two copies where the answer has two', () => {
      expect(s('babes', 'abbey')).toBe('present present correct correct absent')
    })

    it('marks surplus copies absent when the answer holds fewer', () => {
      // "geese" has three E; guess "eject" has two, both spendable.
      expect(s('eject', 'geese')).toBe('present absent correct absent absent')
    })

    it('does not let a yellow consume a letter reserved by a later green', () => {
      // The single I in "abide" sits at index 2 but the guess is green nowhere
      // on I, so the trailing I is the one that scores.
      expect(s('eerie', 'abide')).toBe('absent absent absent present correct')
    })

    it('is case-insensitive on both sides', () => {
      expect(s('CRANE', 'crane')).toBe('correct correct correct correct correct')
      expect(s('crane', 'CRANE')).toBe('correct correct correct correct correct')
    })
  })

  it('works for 6- and 7-letter modes', () => {
    expect(scoreGuess('people', 'purple')).toHaveLength(6)
    expect(scoreGuess('because', 'between')).toHaveLength(7)
  })

  it('throws on a length mismatch rather than scoring nonsense', () => {
    expect(() => scoreGuess('crane', 'people')).toThrow(/length mismatch/)
  })
})

describe('isSolved', () => {
  it('is true only when every tile is correct', () => {
    expect(isSolved(scoreGuess('crane', 'crane'))).toBe(true)
    expect(isSolved(scoreGuess('crank', 'crane'))).toBe(false)
    expect(isSolved([])).toBe(false)
  })
})

describe('marksToSquares', () => {
  it('renders the spoiler-free row', () => {
    expect(marksToSquares(scoreGuess('bobby', 'abbey'))).toBe('\u{1F7E8}⬜\u{1F7E9}⬜\u{1F7E9}')
  })
})
