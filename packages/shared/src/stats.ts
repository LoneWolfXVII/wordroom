import { MAX_GUESSES, type Mode, type PlayerStats, type StatAttempt } from './types.js'

/**
 * Per-player, per-mode stats.
 *
 * Streak = consecutive *puzzle numbers* solved in this mode. Failing a puzzle
 * breaks it, and so does skipping one: solving 1, 2, 3 and then 5 leaves a
 * current streak of 1, because No. 4 was never solved. Modes are independent —
 * attempts in other modes are filtered out, not counted as skips.
 *
 * The current streak is the run ending at the highest number the player has
 * *solved*; a fail or skip after that run has already broken it, so the current
 * streak is 0 unless the run reaches the last solve.
 */
export function computeStats(attempts: readonly StatAttempt[], mode: Mode): PlayerStats {
  const inMode = attempts.filter((a) => a.mode === mode).sort((a, b) => a.number - b.number)

  // One row per puzzle number; a repeat of the same number is ignored (the DB
  // has a unique (player, puzzle) constraint, but callers may merge sources).
  const byNumber = new Map<number, StatAttempt>()
  for (const a of inMode) {
    if (!byNumber.has(a.number)) byNumber.set(a.number, a)
  }
  const rows = [...byNumber.values()].sort((a, b) => a.number - b.number)

  const distribution = new Array<number>(MAX_GUESSES).fill(0)
  let won = 0

  for (const a of rows) {
    if (!a.solved) continue
    won++
    const bucket = a.guessCount - 1
    if (bucket >= 0 && bucket < MAX_GUESSES) {
      distribution[bucket] = (distribution[bucket] ?? 0) + 1
    }
  }

  let running = 0
  let maxStreak = 0
  let previousNumber: number | null = null
  let streakEndsAt: number | null = null

  for (const a of rows) {
    const consecutive = previousNumber !== null && a.number === previousNumber + 1
    if (a.solved) {
      running = consecutive ? running + 1 : 1
      streakEndsAt = a.number
      if (running > maxStreak) maxStreak = running
    } else {
      running = 0
      streakEndsAt = null
    }
    previousNumber = a.number
  }

  const lastSolvedNumber = [...rows].reverse().find((a) => a.solved)?.number ?? null
  const currentStreak = streakEndsAt !== null && streakEndsAt === lastSolvedNumber ? running : 0

  const played = rows.length

  return {
    mode,
    played,
    won,
    winPercent: played === 0 ? 0 : Math.round((won / played) * 100),
    currentStreak,
    maxStreak,
    distribution,
  }
}
