/**
 * Request validation. Every function parses its body before it reaches the
 * database, so a malformed request is a readable 400 rather than a constraint
 * error with a table name in it.
 */

import { assert, assertEquals } from '@std/assert'
import { getPuzzleSchema, revealSchema, submitGuessSchema } from '../_shared/schemas.ts'

const ROOM = '22222222-2222-4222-8222-222222222222'
const PUZZLE = '11111111-1111-4111-8111-111111111111'
const ATTEMPT = '33333333-3333-4333-8333-333333333333'

Deno.test('get-puzzle takes a room, a mode and a number', () => {
  assert(getPuzzleSchema.safeParse({ roomId: ROOM, mode: 5, number: 1 }).success)
  assert(getPuzzleSchema.safeParse({ roomId: ROOM, mode: 7, number: 400 }).success)
})

Deno.test('get-puzzle rejects a mode that has no sequence', () => {
  for (const mode of [4, 8, 0, '5']) {
    assert(!getPuzzleSchema.safeParse({ roomId: ROOM, mode, number: 1 }).success, `${mode}`)
  }
})

Deno.test('puzzle numbers start at 1 and are whole', () => {
  assert(!getPuzzleSchema.safeParse({ roomId: ROOM, mode: 5, number: 0 }).success)
  assert(!getPuzzleSchema.safeParse({ roomId: ROOM, mode: 5, number: -3 }).success)
  assert(!getPuzzleSchema.safeParse({ roomId: ROOM, mode: 5, number: 1.5 }).success)
})

Deno.test('a room id has to look like an id', () => {
  assert(!getPuzzleSchema.safeParse({ roomId: 'KHX7', mode: 5, number: 1 }).success)
})

Deno.test('submit-guess takes either a guess or a timeout', () => {
  const guess = submitGuessSchema.safeParse({ puzzleId: PUZZLE, guess: 'crane' })
  assert(guess.success)

  const timedOut = submitGuessSchema.safeParse({ puzzleId: PUZZLE, timedOut: true })
  assert(timedOut.success)
})

Deno.test('submit-guess rejects a body with neither', () => {
  assert(!submitGuessSchema.safeParse({ puzzleId: PUZZLE }).success)
  assert(!submitGuessSchema.safeParse({ puzzleId: PUZZLE, guess: '' }).success)
})

Deno.test('reported play time is bounded and whole', () => {
  assert(submitGuessSchema.safeParse({ puzzleId: PUZZLE, guess: 'crane', elapsedMs: 0 }).success)
  assert(!submitGuessSchema.safeParse({ puzzleId: PUZZLE, guess: 'crane', elapsedMs: -1 }).success)
  assert(!submitGuessSchema.safeParse({ puzzleId: PUZZLE, guess: 'crane', elapsedMs: 1.5 }).success)
  assert(
    !submitGuessSchema.safeParse({ puzzleId: PUZZLE, guess: 'crane', elapsedMs: 1e12 }).success,
  )
})

Deno.test('reveal accepts either id the caller has to hand', () => {
  const byAttempt = revealSchema.safeParse({ attemptId: ATTEMPT })
  assert(byAttempt.success)
  assert('attemptId' in byAttempt.data)

  const byPuzzle = revealSchema.safeParse({ puzzleId: PUZZLE })
  assert(byPuzzle.success)
  assert('puzzleId' in byPuzzle.data)

  assert(!revealSchema.safeParse({}).success)
})

Deno.test('a guess is trimmed before it is measured', () => {
  const parsed = submitGuessSchema.parse({ puzzleId: PUZZLE, guess: '  crane  ' })
  assert(!('timedOut' in parsed) || parsed.timedOut !== true)
  assertEquals('guess' in parsed ? parsed.guess : null, 'crane')
})
