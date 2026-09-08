import { MAX_GUESSES, type MarkRow } from '@wordroom/shared'
import type { ShareInput } from '@/features/game/share'
import { formatClock } from '@/features/game/timer'

/** One row of the card: the colours always, the word only when it is allowed. */
export interface CardRow {
  marks: MarkRow
  /** The guessed word, or null on the spoiler-free card, where it does not exist. */
  word: string | null
}

export interface CardInput {
  puzzleNumber: number
  roomCode: string
  rows: readonly CardRow[]
  solved: boolean
  hardMode: boolean
  elapsedMs: number | null
  /** True on the letters card. Drives the link line. */
  withLetters: boolean
  /**
   * The host to print on the card, taken from the request that asked for the
   * image. The card is rendered on the server, where there is no `window` to
   * read, so a client-side default would always fall back to the production
   * domain — and print a link nobody can reach from a preview or a
   * `*.vercel.app` deploy.
   */
  host: string
}

/**
 * The headline, in the three pieces the layout needs.
 *
 * `shareHeadline()` in `features/game/share.ts` is the authority on this string
 * and the card must not disagree with it, so `headline.test.ts` asserts that
 * `product + ' ' + number + ' · ' + score` reproduces it exactly. Splitting the
 * finished string with a regexp would be the other way round, and would quietly
 * survive the day someone changes the separator.
 */
export function cardHeadline(input: CardInput): { product: string; number: string; score: string } {
  const used = input.solved ? String(input.rows.length) : 'X'
  const hard = input.hardMode ? '*' : ''
  const time = input.elapsedMs === null ? '' : ` in ${formatClock(input.elapsedMs)}`
  return {
    product: 'Wordroom',
    number: `No. ${input.puzzleNumber}`,
    score: `${used}/${MAX_GUESSES}${hard}${time}`,
  }
}

/** The same result as a `ShareInput`, so the test can compare the two renderings. */
export function cardShareInput(input: CardInput): ShareInput {
  return {
    puzzleNumber: input.puzzleNumber,
    guesses: input.rows.map((row) => ({ guess: row.word ?? '', marks: row.marks })),
    solved: input.solved,
    hardMode: input.hardMode,
    elapsedMs: input.elapsedMs,
    roomCode: input.roomCode,
  }
}
