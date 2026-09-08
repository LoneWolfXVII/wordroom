import type { Mark, MarkRow } from './types.js'

/**
 * Score a guess against an answer, Wordle-style.
 *
 * Two passes, so repeated letters are handled correctly: greens are claimed
 * first, then each remaining letter of the guess is marked `present` only while
 * unclaimed copies of it are left in the answer. A guess with more copies of a
 * letter than the answer holds gets `absent` for the surplus, left to right.
 *
 * SERVER ONLY in practice: calling this needs the answer. The client receives
 * the returned marks, never the input.
 *
 * @throws if guess and answer are different lengths.
 */
export function scoreGuess(guess: string, answer: string): MarkRow {
  const g = guess.toLowerCase()
  const a = answer.toLowerCase()

  if (g.length !== a.length) {
    throw new Error(`scoreGuess: length mismatch (guess ${g.length}, answer ${a.length})`)
  }

  const marks: Mark[] = new Array(g.length).fill('absent')

  // Remaining answer letters that a `present` mark is still allowed to consume.
  const pool = new Map<string, number>()

  for (let i = 0; i < g.length; i++) {
    const gi = g[i] as string
    const ai = a[i] as string
    if (gi === ai) {
      marks[i] = 'correct'
    } else {
      pool.set(ai, (pool.get(ai) ?? 0) + 1)
    }
  }

  for (let i = 0; i < g.length; i++) {
    if (marks[i] === 'correct') continue
    const gi = g[i] as string
    const left = pool.get(gi) ?? 0
    if (left > 0) {
      marks[i] = 'present'
      pool.set(gi, left - 1)
    }
  }

  return marks
}

/** True when every tile is `correct`. */
export function isSolved(marks: MarkRow): boolean {
  return marks.length > 0 && marks.every((m) => m === 'correct')
}

const SHARE_SQUARE: Record<Mark, string> = {
  correct: '\u{1F7E9}',
  present: '\u{1F7E8}',
  absent: '⬜',
}

/** One row of the spoiler-free share grid. */
export function marksToSquares(marks: MarkRow): string {
  return marks.map((m) => SHARE_SQUARE[m]).join('')
}
