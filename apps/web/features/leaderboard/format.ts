/** `1 -> "1st"`, `2 -> "2nd"`, `11 -> "11th"`. The prototype's `ord()`. */
export function ordinal(value: number): string {
  const rest = value % 100
  const suffix = rest > 10 && rest < 14 ? 'th' : (['th', 'st', 'nd', 'rd'][value % 10] ?? 'th')
  return `${value}${suffix}`
}

/**
 * The `.avg` line under a score: `"3.4 avg"`.
 *
 * `leaderboard_*.average_guesses` is null until a player solves something, and
 * the view rounds to two places. An em dash is honest about "no solves yet"; a
 * 0.0 would read as a perfect score.
 */
export function formatAverage(averageGuesses: number, solved: number): string {
  if (solved === 0 || !Number.isFinite(averageGuesses)) return '— avg'
  return `${averageGuesses.toFixed(1)} avg`
}

/** `98_000 -> "1:38"`. Matches the prototype's `fmt()` and the share text. */
export function formatClock(milliseconds: number): string {
  const seconds = Math.max(0, Math.round(milliseconds / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
