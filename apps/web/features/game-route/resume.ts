import type { SupabaseClient } from '@supabase/supabase-js'
import type { Mode } from '@wordroom/shared'

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
 * `answer` column, and `my_attempts` is filtered to the caller by `auth.uid()`
 * — this asks only for the two fields it needs, never `guesses`.
 *
 * A failure here is not worth blocking the game for: it falls back to 1, which
 * is the same behaviour as a player who has never played.
 */
export async function resumePuzzleNumber(
  client: SupabaseClient,
  roomId: string,
  mode: Mode,
): Promise<number> {
  const { data: puzzles, error: puzzlesError } = await client
    .from('room_puzzles')
    .select('id, number')
    .eq('room_id', roomId)
    .eq('mode', mode)

  if (puzzlesError || !puzzles || puzzles.length === 0) return 1

  const numberById = new Map<string, number>()
  for (const row of puzzles as { id: string; number: number }[]) {
    numberById.set(row.id, row.number)
  }

  const { data: attempts, error: attemptsError } = await client
    .from('my_attempts')
    .select('puzzle_id, finished_at')
    .in('puzzle_id', [...numberById.keys()])

  if (attemptsError || !attempts) return 1

  let unfinished: number | null = null
  let highestFinished = 0

  for (const row of attempts as { puzzle_id: string; finished_at: string | null }[]) {
    const number = numberById.get(row.puzzle_id)
    if (number === undefined) continue

    if (row.finished_at === null) {
      // The lowest unfinished number, so a player who somehow has two open
      // attempts is returned to the earlier one rather than the later.
      unfinished = unfinished === null ? number : Math.min(unfinished, number)
    } else if (number > highestFinished) {
      highestFinished = number
    }
  }

  if (unfinished !== null) return unfinished
  return highestFinished + 1
}
