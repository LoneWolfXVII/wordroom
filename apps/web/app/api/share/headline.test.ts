import type { MarkRow } from '@wordroom/shared'
import { describe, expect, it } from 'vitest'
import { shareHeadline } from '@/features/game/share'
import { type CardInput, cardHeadline, cardShareInput } from './headline'

const solvedRows: { marks: MarkRow; word: string | null }[] = [
  { marks: ['absent', 'absent', 'absent', 'present', 'absent'], word: 'crane' },
  { marks: ['correct', 'present', 'absent', 'absent', 'absent'], word: 'sound' },
  { marks: ['correct', 'correct', 'absent', 'correct', 'correct'], word: 'sting' },
  { marks: ['correct', 'correct', 'correct', 'correct', 'correct'], word: 'swing' },
]

function card(overrides: Partial<CardInput> = {}): CardInput {
  return {
    puzzleNumber: 12,
    roomCode: 'KHXZ',
    rows: solvedRows,
    solved: true,
    hardMode: false,
    elapsedMs: null,
    host: 'wordroom.example',
    withLetters: true,
    ...overrides,
  }
}

/**
 * The card and the share text are two renderings of one sentence. This is the
 * test that keeps them one sentence: it rebuilds the headline out of the pieces
 * the layout draws and asserts it is character-for-character what
 * `shareHeadline()` produces.
 */
function joined(input: CardInput): string {
  const { product, number, score } = cardHeadline(input)
  return `${product} ${number} · ${score}`
}

describe('cardHeadline', () => {
  it.each([
    ['a plain solve', card()],
    ['a hard-mode solve', card({ hardMode: true })],
    ['a timed solve', card({ elapsedMs: 98_000 })],
    ['a timed hard-mode solve', card({ hardMode: true, elapsedMs: 98_000 })],
    ['a fail', card({ solved: false, rows: [...solvedRows, ...solvedRows].slice(0, 6) })],
    ['a one-guess solve', card({ rows: solvedRows.slice(3) })],
  ])('agrees with the share text for %s', (_name, input) => {
    expect(joined(input)).toBe(shareHeadline(cardShareInput(input)))
  })

  it('splits into the pieces the layout places separately', () => {
    expect(cardHeadline(card({ hardMode: true, elapsedMs: 98_000 }))).toEqual({
      product: 'Wordroom',
      number: 'No. 12',
      score: '4/6* in 1:38',
    })
  })

  it('scores an unsolved attempt as X', () => {
    expect(cardHeadline(card({ solved: false })).score).toBe('X/6')
  })
})
