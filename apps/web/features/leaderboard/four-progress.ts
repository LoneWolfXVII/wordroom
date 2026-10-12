import { FOUR_BOARDS } from '@wordroom/shared'
import type { PuzzleProgress, PuzzleStatus } from './types'

/** The answer-free attempt columns this needs. */
export interface FourAttemptRow {
  player_id: unknown
  puzzle_id: unknown
  solved: unknown
  guess_count: unknown
  finished_at: unknown
}

/**
 * Where each player has got to on one Four at once game.
 *
 * `boards` maps the game's four puzzle ids to board 1-4. A player's row is the
 * guess each board was solved on — the chips the leaderboard shows instead of a
 * colour grid — and a status: solved when all four are, failed when the game
 * ended otherwise, playing once there is a guess.
 */
export function fourProgress(
  attempts: readonly FourAttemptRow[],
  boards: ReadonlyMap<string, number>,
): PuzzleProgress[] {
  const byPlayer = new Map<string, FourAttemptRow[]>()
  for (const row of attempts) {
    if (typeof row.player_id !== 'string' || typeof row.puzzle_id !== 'string') continue
    if (!boards.has(row.puzzle_id)) continue
    const list = byPlayer.get(row.player_id) ?? []
    list.push(row)
    byPlayer.set(row.player_id, list)
  }

  return [...byPlayer].map(([playerId, rows]) => {
    const solvedAt: (number | null)[] = new Array(FOUR_BOARDS).fill(null)
    let solved = 0
    let finished = 0
    let guessed = false
    for (const row of rows) {
      const board = boards.get(row.puzzle_id as string) ?? 0
      const count = typeof row.guess_count === 'number' ? row.guess_count : 0
      if (count > 0) guessed = true
      if (row.finished_at !== null && row.finished_at !== undefined) finished++
      if (row.solved === true) {
        solved++
        if (board >= 1 && board <= FOUR_BOARDS) solvedAt[board - 1] = count
      }
    }

    const status: PuzzleStatus =
      solved === FOUR_BOARDS
        ? 'solved'
        : finished === FOUR_BOARDS
          ? 'failed'
          : guessed
            ? 'playing'
            : 'waiting'

    return { playerId, grid: [], solvedAt, status }
  })
}
