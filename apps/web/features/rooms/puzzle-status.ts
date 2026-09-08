import type { SupabaseClient } from '@supabase/supabase-js'
// The allowlist module directly, not `@/features/leaderboard` — the barrel also
// exports that feature's React components, and nothing here renders one.
import {
  type AnswerFreeAttempt,
  ATTEMPT_PUBLIC_SELECT,
  forbiddenColumns,
  narrowAttempt,
} from '@/features/leaderboard/answer-free'
import { ApiError } from './errors'

/**
 * Where each member has got to on the puzzle currently on screen.
 *
 * This is the member list's right-hand column — the prototype's "solved" /
 * "playing". The state lives in `attempts`, which is workstream 4's to read, so
 * nothing here invents a query shape: `ATTEMPT_PUBLIC_SELECT` is their allowlist,
 * copied from the column grant in `20260908000200_rls.sql`, and `narrowAttempt`
 * is their guard. Both are used exactly as the leaderboard uses them.
 *
 * **`guesses` is never asked for and never read.** A solved attempt's last guess
 * *is* the answer, which is why the column is revoked from the room in the first
 * place. `select *` is not an option here even by accident: the allowlist names
 * eleven columns and `guesses` is not one of them, so a widened grant tomorrow
 * still cannot reach this file.
 *
 * What the room may see is what it can already see on the leaderboard — whether
 * someone finished, not what they typed.
 */

/**
 * One member's progress on one puzzle.
 *
 * - `solved` — finished it, in some number of guesses.
 * - `missed` — finished without solving: out of guesses, or the timer ran out.
 * - `playing` — has guessed at least once and is still going.
 * - `waiting` — has not started this puzzle. No attempt row exists yet; the row
 *   is written on the first accepted guess, not when the puzzle is fetched.
 */
export type MemberPuzzleStatus = 'solved' | 'missed' | 'playing' | 'waiting'

/** Player id -> where they have got to. Absent means `waiting`. */
export type PuzzleStatusMap = Record<string, MemberPuzzleStatus>

/**
 * Read a status out of one allowlisted attempt record.
 *
 * The order matters: `solved` implies `finished_at` (the
 * `attempts_solved_finished` constraint guarantees it), so a solve has to be
 * tested first or every solve would read as a miss.
 */
export function attemptStatus(record: AnswerFreeAttempt): MemberPuzzleStatus {
  if (record.solved === true) return 'solved'
  if (record.finished_at !== null && record.finished_at !== undefined) return 'missed'
  return typeof record.guess_count === 'number' && record.guess_count > 0 ? 'playing' : 'waiting'
}

/** Whether the member is done with this puzzle, however it went. */
export function isFinished(status: MemberPuzzleStatus): boolean {
  return status === 'solved' || status === 'missed'
}

/**
 * The caption for a status, or null when there is nothing worth saying.
 *
 * `waiting` renders nothing: an empty column is how the prototype shows someone
 * who has not started, and a row that says "waiting" next to every name on a
 * fresh puzzle is noise rather than information.
 */
export function statusLabel(status: MemberPuzzleStatus): string | null {
  switch (status) {
    case 'solved':
      return 'solved'
    case 'missed':
      return 'missed'
    case 'playing':
      return 'playing'
    case 'waiting':
      return null
  }
}

/**
 * Fold raw rows into a map keyed by player.
 *
 * Every row goes through `narrowAttempt` first, so only the eleven allowlisted
 * columns exist past this line — a row that somehow arrived with `guesses` on it
 * loses the field here rather than reaching React state.
 */
export function statusesByPlayer(rows: readonly unknown[]): PuzzleStatusMap {
  const statuses: PuzzleStatusMap = {}

  for (const row of rows) {
    const record = narrowAttempt(row)
    const playerId = record.player_id
    if (typeof playerId !== 'string' || playerId === '') continue
    statuses[playerId] = attemptStatus(record)
  }

  return statuses
}

/**
 * Every member's progress on one puzzle.
 *
 * Goes through PostgREST as the signed-in user, so `attempts_select_member`
 * decides which rows come back — the same policy the leaderboard reads under.
 * The puzzle id comes from the game, which already has it; there is no lookup
 * against `room_puzzles` to do and so no second round trip.
 */
export async function fetchPuzzleStatuses(
  client: SupabaseClient,
  puzzleId: string,
): Promise<PuzzleStatusMap> {
  const { data, error } = await client
    .from('attempts')
    .select(ATTEMPT_PUBLIC_SELECT)
    .eq('puzzle_id', puzzleId)

  if (error) throw new ApiError('internal', error.message)

  const rows: unknown[] = Array.isArray(data) ? data : []

  // Say it out loud if a row ever carries a column the room may not see, the way
  // the leaderboard's realtime handler does. `statusesByPlayer` drops it either
  // way; this is so the mistake is findable rather than silent.
  for (const row of rows) {
    const leaked = forbiddenColumns(row)
    if (leaked.length > 0) {
      console.error(
        `An attempts row carried columns the room may not see: ${leaked.join(', ')}. Dropped.`,
      )
      break
    }
  }

  return statusesByPlayer(rows)
}
