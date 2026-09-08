import { MAX_GUESSES, type PlayerStats } from '@wordroom/shared'

/**
 * The six-bar guess distribution, as data.
 *
 * Kept apart from the JSX so the width maths is unit-testable: a bar chart that
 * silently scales wrong is the kind of bug you only notice in a screenshot.
 */

export interface DistributionBar {
  /** 1 through `MAX_GUESSES`. */
  guesses: number
  count: number
  /** Bar width as a percentage of the track. The tallest bar is always 100. */
  percent: number
  /** The row for the puzzle just finished — rendered in --correct. */
  highlighted: boolean
}

/**
 * Every bar keeps this much width even at zero, so the count at its end has
 * somewhere to sit and the six rows read as a column rather than a ragged edge.
 */
const MIN_PERCENT = 10

/**
 * @param stats  Straight from `computeStats()` in `@wordroom/shared`. The streak
 *               and distribution rules live there and are tested there.
 * @param highlightGuesses  Guess count of the puzzle just solved, or null when
 *               the sheet is opened outside a result (nothing is highlighted).
 */
export function distributionBars(
  stats: PlayerStats,
  highlightGuesses: number | null = null,
): DistributionBar[] {
  const counts = Array.from({ length: MAX_GUESSES }, (_, index) => stats.distribution[index] ?? 0)
  const max = counts.reduce((widest, count) => Math.max(widest, count), 0)

  return counts.map((count, index) => {
    const guesses = index + 1
    return {
      guesses,
      count,
      percent: max === 0 ? MIN_PERCENT : MIN_PERCENT + (count / max) * (100 - MIN_PERCENT),
      highlighted: highlightGuesses === guesses,
    }
  })
}
