/**
 * The one rule: answers never reach the client.
 *
 * This is the unit-level twin of the Playwright assertion workstream 6 adds.
 * Everything a handler can put on the wire is built by `_shared/presenters.ts`,
 * so it is enough to drive those builders through every state an attempt can be
 * in and search the serialised body for the answer.
 */

import { assert, assertEquals, assertThrows } from '@std/assert'
import type { PuzzleRow } from '../_shared/db.ts'
import { AppError } from '../_shared/errors.ts'
import { emptyAttemptState, playGuess, timeOut } from '../_shared/guess-engine.ts'
import {
  assertAnswerAbsent,
  type GuessResultBody,
  guessResultBody,
  toPuzzle,
} from '../_shared/presenters.ts'

const ANSWER = 'crane'
const NOW = '2026-09-08T12:00:00.000Z'

const puzzleRow: PuzzleRow = {
  id: '11111111-1111-4111-8111-111111111111',
  room_id: '22222222-2222-4222-8222-222222222222',
  mode: 5,
  number: 12,
  answer: ANSWER,
  created_at: NOW,
}

const contains = (body: unknown, needle: string) =>
  JSON.stringify(body).toLowerCase().includes(needle.toLowerCase())

Deno.test('toPuzzle drops the answer', () => {
  const puzzle = toPuzzle(puzzleRow)
  assertEquals(Object.keys(puzzle).sort(), ['id', 'mode', 'number', 'roomId'])
  assert(!contains(puzzle, ANSWER))
  assert(!('answer' in puzzle))
})

Deno.test('an unfinished guess response carries marks and nothing else', () => {
  const body = guessResultBody({
    attemptId: 'a',
    puzzleId: 'p',
    marks: ['absent', 'absent', 'present', 'absent', 'present'],
    guessCount: 1,
    solved: false,
    finishedAt: null,
    elapsedMs: 4200,
    answer: ANSWER,
  })

  assert(!contains(body, ANSWER))
  assert(!('answer' in body))
  assert(!('points' in body))
  assertEquals(body.guessesRemaining, 5)
})

Deno.test('every response in a losing game is answer-free until the sixth guess', () => {
  let state = emptyAttemptState(false)
  const words = ['slate', 'built', 'mound', 'porch', 'gifts', 'wharf']
  const bodies: GuessResultBody[] = []

  for (const word of words) {
    const outcome = playGuess({ answer: ANSWER, mode: 5, guess: word, state, now: NOW })
    assert(outcome.kind === 'accepted')
    state = outcome.next
    bodies.push(
      guessResultBody({
        attemptId: 'a',
        puzzleId: 'p',
        marks: outcome.marks,
        guessCount: state.guesses.length,
        solved: state.solved,
        finishedAt: state.finishedAt,
        elapsedMs: null,
        answer: ANSWER,
      }),
    )
  }

  for (const body of bodies.slice(0, 5)) {
    assert(!contains(body, ANSWER), 'answer leaked before the attempt finished')
  }

  const last = bodies[5]
  assert(last)
  assertEquals(last.answer, ANSWER)
  assertEquals(last.solved, false)
  assertEquals(last.points, 0)
})

Deno.test('a solve is the other moment the answer is unlocked', () => {
  const first = playGuess({
    answer: ANSWER,
    mode: 5,
    guess: 'slate',
    state: emptyAttemptState(false),
    now: NOW,
  })
  assert(first.kind === 'accepted')
  assert(
    !contains(
      guessResultBody({
        attemptId: 'a',
        puzzleId: 'p',
        marks: first.marks,
        guessCount: 1,
        solved: false,
        finishedAt: null,
        elapsedMs: null,
        answer: ANSWER,
      }),
      ANSWER,
    ),
  )

  const solve = playGuess({ answer: ANSWER, mode: 5, guess: ANSWER, state: first.next, now: NOW })
  assert(solve.kind === 'accepted')
  const body = guessResultBody({
    attemptId: 'a',
    puzzleId: 'p',
    marks: solve.marks,
    guessCount: 2,
    solved: true,
    finishedAt: NOW,
    elapsedMs: 9000,
    answer: ANSWER,
  })
  assertEquals(body.answer, ANSWER)
  assertEquals(body.points, 5)
})

Deno.test('a timeout unlocks the answer, and only then', () => {
  const first = playGuess({
    answer: ANSWER,
    mode: 5,
    guess: 'slate',
    state: emptyAttemptState(false),
    now: NOW,
  })
  assert(first.kind === 'accepted')
  assert(first.next.finishedAt === null)

  const live = guessResultBody({
    attemptId: 'a',
    puzzleId: 'p',
    marks: null,
    guessCount: 1,
    solved: false,
    finishedAt: first.next.finishedAt,
    elapsedMs: null,
    answer: ANSWER,
  })
  assert(!contains(live, ANSWER))

  const expired = timeOut(first.next, NOW)
  const body = guessResultBody({
    attemptId: 'a',
    puzzleId: 'p',
    marks: null,
    guessCount: 1,
    solved: false,
    finishedAt: expired.finishedAt,
    elapsedMs: 180_000,
    answer: ANSWER,
  })
  assertEquals(body.answer, ANSWER)
  assertEquals(body.points, 0)
})

Deno.test('assertAnswerAbsent turns a leak into a server error, not a spoiler', () => {
  assertAnswerAbsent({ marks: ['absent'] }, ANSWER)

  const thrown = assertThrows(
    () => assertAnswerAbsent({ debug: 'the answer was CRANE' }, ANSWER),
    AppError,
  )
  assertEquals(thrown.code, 'internal')
  // The thrown error must not repeat the answer either.
  assert(!thrown.message.toLowerCase().includes(ANSWER))
})

Deno.test('guessResultBody refuses to build an unfinished body that leaks', () => {
  assertThrows(
    () =>
      guessResultBody({
        attemptId: ANSWER,
        puzzleId: 'p',
        marks: null,
        guessCount: 0,
        solved: false,
        finishedAt: null,
        answer: ANSWER,
        elapsedMs: null,
      }),
    AppError,
  )
})
