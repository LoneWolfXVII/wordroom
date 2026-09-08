/**
 * get-puzzle — the room's puzzle No. N for a mode, created on first request.
 *
 * POST { roomId, mode, number }
 *   -> 200 { puzzle: Puzzle }
 *
 * The response is the `Puzzle` type from `@wordroom/shared`, which has no
 * `answer` field to put one in. The answer is derived here, written to the
 * `puzzles` row, and left there.
 *
 * One round trip on the warm path, two on the cold one. See
 * `_shared/puzzle.ts` for why the cold path cannot be one.
 */

import { requireCaller } from '../_shared/auth.ts'
import { serviceClient } from '../_shared/db.ts'
import { unprocessable } from '../_shared/errors.ts'
import { jsonResponse, readJson, serveFunction } from '../_shared/http.ts'
import { assertAnswerAbsent, toPuzzle } from '../_shared/presenters.ts'
import { loadPuzzleContext, materialisePuzzle } from '../_shared/puzzle.ts'
import { getPuzzleSchema } from '../_shared/schemas.ts'

serveFunction(async (req) => {
  const caller = await requireCaller(req)
  const db = serviceClient()
  const body = await readJson(req, getPuzzleSchema)

  // Membership, the room, how far the room has got, the puzzle if it already
  // exists, and the size of the word bank — all of it, once. A caller who is
  // not in the room gets no row, which is what this turns into `not_a_member`.
  const context = await loadPuzzleContext(db, body.roomId, body.mode, body.number, caller.userId)

  // Players advance independently, so any number the room has already reached
  // is fair game — you can go back and play one you skipped. What you cannot do
  // is jump ahead and materialise puzzle 900, which would let one player mine
  // the sequence far beyond where the room actually is.
  const { reached } = context
  const next = reached + 1
  if (body.number > next) {
    throw unprocessable(
      'puzzle_out_of_sequence',
      `This room has reached No. ${reached}. The next puzzle is No. ${next}.`,
      { reached, next },
    )
  }

  const puzzle = await materialisePuzzle(db, context, body.mode, body.number)

  const responseBody = { puzzle: toPuzzle(puzzle) }
  assertAnswerAbsent(responseBody, puzzle.answer)

  return jsonResponse(req, responseBody)
})
