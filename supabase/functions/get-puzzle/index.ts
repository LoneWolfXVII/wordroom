/**
 * get-puzzle — the room's puzzle No. N for a mode, created on first request.
 *
 * POST { roomId, mode, number }
 *   -> 200 { puzzle: Puzzle }
 *
 * The response is the `Puzzle` type from `@wordroom/shared`, which has no
 * `answer` field to put one in. The answer is derived here, written to the
 * `puzzles` row, and left there.
 */

import { requireCaller, requireMembership } from '../_shared/auth.ts'
import { serviceClient } from '../_shared/db.ts'
import { unprocessable } from '../_shared/errors.ts'
import { jsonResponse, readJson, serveFunction } from '../_shared/http.ts'
import { assertAnswerAbsent, toPuzzle } from '../_shared/presenters.ts'
import { highestNumber, loadRoomForMember, materialisePuzzle } from '../_shared/puzzle.ts'
import { getPuzzleSchema } from '../_shared/schemas.ts'

serveFunction(async (req) => {
  const caller = await requireCaller(req)
  const db = serviceClient()
  const body = await readJson(req, getPuzzleSchema)

  // Membership first, before anything loads a seed or an answer.
  await requireMembership(db, body.roomId, caller.userId)
  const room = await loadRoomForMember(db, body.roomId)

  // Players advance independently, so any number the room has already reached
  // is fair game — you can go back and play one you skipped. What you cannot do
  // is jump ahead and materialise puzzle 900, which would let one player mine
  // the sequence far beyond where the room actually is.
  const reached = await highestNumber(db, room.id, body.mode)
  if (body.number > reached + 1) {
    throw unprocessable(
      'puzzle_out_of_sequence',
      `This room has reached No. ${reached}. The next puzzle is No. ${reached + 1}.`,
      { reached, next: reached + 1 },
    )
  }

  const puzzle = await materialisePuzzle(db, room, body.mode, body.number)

  const responseBody = { puzzle: toPuzzle(puzzle) }
  assertAnswerAbsent(responseBody, puzzle.answer)

  return jsonResponse(req, responseBody)
})
