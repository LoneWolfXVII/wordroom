import { FOUR_MAX_GUESSES, MAX_GUESSES } from './types.js'

/**
 * Per-puzzle score. A solve in `n` guesses is worth `7 - n`, so 1 guess is 6
 * points down to 6 guesses for 1. A failed or abandoned puzzle is worth 0 —
 * time never adds points, it only breaks ties on the leaderboard.
 *
 * Mirrored in SQL by `public.attempt_points()`; change both together.
 */
export function points(guessCount: number, solved: boolean): number {
  if (!solved) return 0
  if (!Number.isInteger(guessCount) || guessCount < 1 || guessCount > MAX_GUESSES) return 0
  return Math.max(0, MAX_GUESSES + 1 - guessCount)
}

/**
 * One Four at once board: solved on guess `n` of 9 is worth `10 - n`, so the
 * first guess is 9 points down to the ninth for 1; an unsolved board is 0. The
 * best possible game, boards solved on guesses 1 to 4, is 30.
 *
 * Mirrored in SQL by the `four_games` view; change both together.
 */
export function fourBoardPoints(solvedAt: number | null): number {
  if (solvedAt === null || !Number.isInteger(solvedAt)) return 0
  if (solvedAt < 1 || solvedAt > FOUR_MAX_GUESSES) return 0
  return FOUR_MAX_GUESSES + 1 - solvedAt
}

/** A whole Four game: the sum of its boards, `null` for one never solved. */
export function fourGamePoints(solvedAt: readonly (number | null)[]): number {
  return solvedAt.reduce<number>((sum, n) => sum + fourBoardPoints(n), 0)
}
