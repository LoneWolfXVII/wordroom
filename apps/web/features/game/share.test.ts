import { describe, expect, it } from 'vitest'
import {
  lettersShareWarning,
  type ShareInput,
  shareHeadline,
  shareLink,
  spoilerFreeShare,
  withLettersShare,
} from './share'

/** See keys.test.mts for why these files are `.mts`. */

const mark = (c: string) =>
  c === 'c' ? ('correct' as const) : c === 'p' ? ('present' as const) : ('absent' as const)
const row = (guess: string, marks: string) => ({ guess, marks: [...marks].map(mark) })

/** The worked example from the build plan's "Stats + share" section. */
const example: ShareInput = {
  puzzleNumber: 12,
  guesses: [
    row('crane', 'aaapa'),
    row('sound', 'cpaaa'),
    row('sting', 'ccacc'),
    row('swing', 'ccccc'),
  ],
  solved: true,
  hardMode: false,
  elapsedMs: null,
  roomCode: 'KHX7',
}

describe('spoilerFreeShare', () => {
  it('matches the specified format character for character', () => {
    expect(spoilerFreeShare(example)).toBe(
      [
        'Wordroom No. 12 · 4/6',
        '⬜⬜⬜🟨⬜',
        '🟩🟨⬜⬜⬜',
        '🟩🟩⬜🟩🟩',
        '🟩🟩🟩🟩🟩',
        'wordroom.nischalgupta.dev/r/KHX7',
      ].join('\n'),
    )
  })

  it('never contains a letter of any guess', () => {
    const text = spoilerFreeShare(example)
    for (const guess of example.guesses) {
      expect(text.toUpperCase()).not.toContain(guess.guess.toUpperCase())
    }
  })
})

describe('withLettersShare', () => {
  it('matches the specified format character for character', () => {
    expect(withLettersShare(example)).toBe(
      [
        'Wordroom No. 12 · 4/6',
        'C R A N E  ⬜⬜⬜🟨⬜',
        'S O U N D  🟩🟨⬜⬜⬜',
        'S T I N G  🟩🟩⬜🟩🟩',
        'S W I N G  🟩🟩🟩🟩🟩',
      ].join('\n'),
    )
  })

  it('carries no room link — a link invites the person it spoils it for', () => {
    expect(withLettersShare(example)).not.toContain('wordroom.nischalgupta.dev')
  })
})

describe('shareHeadline', () => {
  it('marks hard mode with an asterisk tight against the score', () => {
    expect(shareHeadline({ ...example, hardMode: true })).toBe('Wordroom No. 12 · 4/6*')
  })

  it('adds the time as a separate word when the timer was on', () => {
    expect(shareHeadline({ ...example, elapsedMs: 98_000 })).toBe('Wordroom No. 12 · 4/6 in 1:38')
  })

  it('puts the asterisk before the time when both apply', () => {
    expect(shareHeadline({ ...example, hardMode: true, elapsedMs: 98_000 })).toBe(
      'Wordroom No. 12 · 4/6* in 1:38',
    )
  })

  it('scores a failed attempt X/6', () => {
    expect(shareHeadline({ ...example, solved: false })).toBe('Wordroom No. 12 · X/6')
  })

  it('omits the time entirely when the timer was off', () => {
    expect(shareHeadline(example)).not.toContain(' in ')
  })
})

describe('shareLink', () => {
  it('uppercases the room code', () => {
    // No `window` under the node test environment, so this is the fallback.
    expect(shareLink('khxb')).toBe('wordroom.nischalgupta.dev/r/KHXB')
  })

  it('prefers the host the page is served from, so a link is reachable', () => {
    expect(shareLink('khxb', 'wordroom-kappa.vercel.app')).toBe('wordroom-kappa.vercel.app/r/KHXB')
  })
})

describe('lettersShareWarning', () => {
  it('names the puzzle it would spoil', () => {
    expect(lettersShareWarning(12)).toBe(
      "This reveals the answer to anyone in your room who hasn't played No. 12.",
    )
  })
})
