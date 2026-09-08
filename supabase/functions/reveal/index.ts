/**
 * reveal — hand back the answer for an attempt that is already over.
 *
 * POST { attemptId } | { puzzleId }
 *   -> 200 RevealBody
 *
 * Two refusals matter here:
 *
 *   - The attempt must be FINISHED. This is not a give-up button; it is the
 *     result sheet re-opening after a reload. An unfinished attempt gets 409.
 *   - The attempt must be the CALLER'S OWN. Revealing another player's finished
 *     attempt would hand you the answer to a puzzle you have not played, which
 *     is exactly why `attempts.guesses` is revoked from the room.
 */

import { points } from '@wordroom/shared'
import { findOwnAttempt, requireCaller, requireMembership } from '../_shared/auth.ts'
import { type AttemptRow, type PuzzleRow, serviceClient } from '../_shared/db.ts'
import { conflict, mapPostgresError, notFound } from '../_shared/errors.ts'
import { jsonResponse, readJson, serveFunction } from '../_shared/http.ts'
import { decodeMarks } from '../_shared/marks.ts'
import type { RevealBody } from '../_shared/presenters.ts'
import { revealSchema } from '../_shared/schemas.ts'

serveFunction(async (req) => {
  const caller = await requireCaller(req)
  const db = serviceClient()
  const body = await readJson(req, revealSchema)

  let attempt: AttemptRow | null = null
  let puzzle: PuzzleRow

  if ('attemptId' in body) {
    const { data, error } = await db
      .from('attempts')
      .select('*')
      .eq('id', body.attemptId)
      .maybeSingle()
    if (error) throw mapPostgresError(error)
    if (!data) throw notFound('attempt_not_found', 'That attempt does not exist.')
    attempt = data as AttemptRow

    const { data: puzzleData, error: puzzleError } = await db
      .from('puzzles')
      .select('id, room_id, mode, number, answer, created_at')
      .eq('id', attempt.puzzle_id)
      .maybeSingle()
    if (puzzleError) throw mapPostgresError(puzzleError)
    if (!puzzleData) throw notFound('puzzle_not_found', 'That puzzle does not exist.')
    puzzle = puzzleData as PuzzleRow

    const player = await requireMembership(db, puzzle.room_id, caller.userId)
    if (attempt.player_id !== player.id) {
      // Same answer as "no such attempt": whose attempt it is, is not the
      // caller's business either.
      throw notFound('attempt_not_found', 'That attempt does not exist.')
    }
  } else {
    const { data, error } = await db
      .from('puzzles')
      .select('id, room_id, mode, number, answer, created_at')
      .eq('id', body.puzzleId)
      .maybeSingle()
    if (error) throw mapPostgresError(error)
    if (!data) throw notFound('puzzle_not_found', 'That puzzle does not exist.')
    puzzle = data as PuzzleRow

    const player = await requireMembership(db, puzzle.room_id, caller.userId)
    attempt = await findOwnAttempt(db, puzzle.id, player.id)
    if (!attempt) throw notFound('attempt_not_found', 'You have not played this puzzle.')
  }

  if (attempt.finished_at === null) {
    throw conflict(
      'attempt_not_finished',
      'Finish the puzzle first — the answer is revealed on a solve, a sixth guess, or a timeout.',
    )
  }

  const revealed: RevealBody = {
    attemptId: attempt.id,
    puzzleId: puzzle.id,
    mode: puzzle.mode,
    number: puzzle.number,
    answer: puzzle.answer,
    solved: attempt.solved,
    guessCount: attempt.guess_count,
    guesses: attempt.guesses,
    marks: decodeMarks(attempt.marks),
    points: points(attempt.guess_count, attempt.solved),
    elapsedMs: attempt.elapsed_ms,
    finishedAt: attempt.finished_at,
  }

  return jsonResponse(req, revealed)
})
