import { MAX_GUESSES } from './types.js'

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
