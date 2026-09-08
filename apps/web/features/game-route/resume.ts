import type { SupabaseClient } from '@supabase/supabase-js'
import { decodeMarks, type Mode, type ScoredGuess } from '@wordroom/shared'
import type { RestoredAttempt } from '@/features/game'

/**
 * Which puzzle number to open when a player arrives in a room.
 *
 * Hardcoding 1 sends someone who has played twenty puzzles back to the first
 * one every time they reload, and — because an attempt is keyed on
 * (player, puzzle) — drops them onto a board they have already finished.
 *
 * The rule, in order:
 *
 *  1. An attempt that was started and never finished is the puzzle they were in
 *     the middle of. Resume it.
 *  2. Otherwise carry on from the highest number they have finished.
 *  3. A player with no attempts in this mode starts at No. 1.
 *
 * Both reads are answer-free by construction. `room_puzzles` is the view with no
 * `answer` column, and `my_attempts` is filtered to the caller by `auth.uid()`,
 * so the `guesses` read below is this player's own board and nobody else's —
 * `attempts.guesses` has no grant for the room precisely because a solved
 * attempt's last guess is the answer.
 *
 * A failure here is not worth blocking the game for: it falls back to 1, which
 * is the same behaviour as a player who has never played.
 */
export interface ResumePoint {
  number: number
  /** Set only when that puzzle has an attempt still in progress. */
  restore?: RestoredAttempt
}

export async function resumePuzzleNumber(
  client: SupabaseClient,
  roomId: string,
  mode: Mode,
): Promise<ResumePoint> {
  const { data: puzzles, error: puzzlesError } = await client
    .from('room_puzzles')
    .select('id, number')
    .eq('room_id', roomId)
    .eq('mode', mode)

  if (puzzlesError || !puzzles || puzzles.length === 0) return { number: 1 }

  const numberById = new Map<string, number>()
  for (const row of puzzles as { id: string; number: number }[]) {
    numberById.set(row.id, row.number)
  }

  // `guesses` and `marks` come from `my_attempts`, the view filtered to the
  // caller — this is the player's own board, never anyone else's, and there is
  // no answer among these columns.
  const { data: attempts, error: attemptsError } = await client
    .from('my_attempts')
    .select('id, puzzle_id, finished_at, guesses, marks')
    .in('puzzle_id', [...numberById.keys()])

  if (attemptsError || !attempts) return { number: 1 }

  type Row = {
    id: string
    puzzle_id: string
    finished_at: string | null
    guesses: string[] | null
    marks: string[] | null
  }

  let open: { number: number; row: Row } | null = null
  let highestFinished = 0

  for (const row of attempts as Row[]) {
    const number = numberById.get(row.puzzle_id)
    if (number === undefined) continue

    if (row.finished_at === null) {
      // The lowest unfinished number, so a player who somehow has two open
      // attempts is returned to the earlier one rather than the later.
      if (open === null || number < open.number) open = { number, row }
    } else if (number > highestFinished) {
      highestFinished = number
    }
  }

  if (open === null) return { number: highestFinished + 1 }

  return { number: open.number, ...restoreFrom(open.row) }
}

/**
 * Turn a stored attempt into the board it represents.
 *
 * A row whose `marks` cannot be decoded is dropped rather than guessed at: an
 * empty board is a recoverable annoyance, a board that disagrees with the
 * server is not. `attempts_marks_match` makes the mismatch impossible in
 * practice, which is exactly why a violation here means something is wrong.
 */
function restoreFrom(row: { id: string; guesses: string[] | null; marks: string[] | null }): {
  restore?: RestoredAttempt
} {
  const words = row.guesses ?? []
  const encoded = row.marks ?? []
  if (words.length === 0 || words.length !== encoded.length) return {}

  let decoded: ReturnType<typeof decodeMarks>
  try {
    decoded = decodeMarks(encoded)
  } catch {
    return {}
  }

  const guesses: ScoredGuess[] = []
  for (let i = 0; i < words.length; i++) {
    const guess = words[i]
    const marks = decoded[i]
    if (guess === undefined || marks === undefined) return {}
    guesses.push({ guess, marks })
  }

  return { restore: { attemptId: row.id, guesses } }
}
