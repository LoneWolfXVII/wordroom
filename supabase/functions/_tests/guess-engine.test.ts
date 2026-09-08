/**
 * The rules that decide what a guess does.
 *
 * `scoreGuess` and `isHardModeValid` themselves are tested in
 * `packages/shared`. What is tested here is that this function applies them at
 * the right moment, and that a rejected guess costs nothing.
 */

import { assert, assertEquals } from '@std/assert'
import { MAX_GUESSES } from '@wordroom/shared'
import {
  type AttemptState,
  emptyAttemptState,
  guessesRemaining,
  playGuess,
  timeOut,
} from '../_shared/guess-engine.ts'

const NOW = '2026-09-08T12:00:00.000Z'

const play = (guess: string, state: AttemptState, answer = 'crane') =>
  playGuess({ answer, mode: 5, guess, state, now: NOW })

Deno.test('scores a guess and advances the attempt', () => {
  const outcome = play('slate', emptyAttemptState(false))
  assert(outcome.kind === 'accepted')
  // slate vs crane: A and E land in place, S, L and T are not in the answer.
  assertEquals(outcome.marks, ['absent', 'absent', 'correct', 'absent', 'correct'])
  assertEquals(outcome.next.guesses, ['slate'])
  assertEquals(outcome.next.marks.length, 1)
  assertEquals(outcome.finished, false)
  assertEquals(outcome.solved, false)
})

Deno.test('a solve finishes the attempt and scores 7 - guesses', () => {
  const first = play('slate', emptyAttemptState(false))
  assert(first.kind === 'accepted')

  const second = play('crane', first.next)
  assert(second.kind === 'accepted')
  assertEquals(second.solved, true)
  assertEquals(second.finished, true)
  assertEquals(second.next.finishedAt, NOW)
  assertEquals(second.points, 5)
})

Deno.test('the sixth guess finishes a failed attempt, worth nothing', () => {
  let state = emptyAttemptState(false)
  const words = ['slate', 'built', 'mound', 'porch', 'gifts', 'wharf']

  for (const [index, word] of words.entries()) {
    const outcome = play(word, state)
    assert(outcome.kind === 'accepted', `${word} should be accepted`)
    state = outcome.next
    assertEquals(outcome.finished, index === words.length - 1)
    assertEquals(guessesRemaining(state), MAX_GUESSES - index - 1)
  }

  assertEquals(state.solved, false)
  assertEquals(state.finishedAt, NOW)
})

Deno.test('is case and whitespace insensitive', () => {
  const outcome = play('  SLATE ', emptyAttemptState(false))
  assert(outcome.kind === 'accepted')
  assertEquals(outcome.next.guesses, ['slate'])
})

Deno.test('an invalid word is rejected and is not counted as a guess', () => {
  const state = emptyAttemptState(false)
  const outcome = play('zzzzz', state)

  assert(outcome.kind === 'rejected')
  assertEquals(outcome.code, 'not_a_word')
  assertEquals(outcome.message, 'Not in word list.')
  // The caller writes nothing on a rejection, so the row is untouched.
  assertEquals(state.guesses.length, 0)
  assertEquals(guessesRemaining(state), MAX_GUESSES)
})

Deno.test('a guess of the wrong length is rejected before the word check', () => {
  const outcome = play('crank', { ...emptyAttemptState(false) }, 'crane')
  assert(outcome.kind === 'accepted')

  const short = play('cat', emptyAttemptState(false))
  assert(short.kind === 'rejected')
  assertEquals(short.code, 'wrong_length')
})

Deno.test('non-letters are rejected rather than scored', () => {
  for (const bad of ['cr4ne', 'cr-ne', 'crâne']) {
    const outcome = play(bad, emptyAttemptState(false))
    assert(outcome.kind === 'rejected', `${bad} should be rejected`)
  }
})

Deno.test('hard mode rejects a guess that moves a revealed green', () => {
  const first = play('slate', emptyAttemptState(true), 'stale')
  assert(first.kind === 'accepted')

  const second = playGuess({
    answer: 'stale',
    mode: 5,
    guess: 'crane',
    state: first.next,
    now: NOW,
  })
  assert(second.kind === 'rejected')
  assertEquals(second.code, 'hard_mode_violation')
  assertEquals(second.message, '1st letter must be S')
  assertEquals(second.details, { reason: 'position' })
  // Still one guess used, not two.
  assertEquals(first.next.guesses.length, 1)
})

Deno.test('hard mode rejects a guess that drops a revealed yellow', () => {
  const first = play('crane', emptyAttemptState(true), 'audit')
  assert(first.kind === 'accepted')

  const second = playGuess({
    answer: 'audit',
    mode: 5,
    guess: 'spilt',
    state: first.next,
    now: NOW,
  })
  assert(second.kind === 'rejected')
  assertEquals(second.code, 'hard_mode_violation')
  assertEquals(second.message, 'Guess must contain A')
})

Deno.test('hard mode is off unless the attempt says so', () => {
  const first = play('slate', emptyAttemptState(false), 'stale')
  assert(first.kind === 'accepted')

  const second = playGuess({
    answer: 'stale',
    mode: 5,
    guess: 'crane',
    state: first.next,
    now: NOW,
  })
  assert(second.kind === 'accepted')
})

Deno.test('a finished attempt takes no more guesses', () => {
  const solved: AttemptState = {
    guesses: ['crane'],
    marks: [['correct', 'correct', 'correct', 'correct', 'correct']],
    solved: true,
    finishedAt: NOW,
    hardMode: false,
  }

  const outcome = play('slate', solved)
  assert(outcome.kind === 'rejected')
  assertEquals(outcome.code, 'attempt_finished')
})

Deno.test('a timeout finishes the attempt as a fail and is idempotent', () => {
  const first = play('slate', emptyAttemptState(false))
  assert(first.kind === 'accepted')

  const timedOut = timeOut(first.next, NOW)
  assertEquals(timedOut.solved, false)
  assertEquals(timedOut.finishedAt, NOW)
  assertEquals(timedOut.guesses, ['slate'])

  const again = timeOut(timedOut, '2026-09-08T13:00:00.000Z')
  assertEquals(again.finishedAt, NOW)
})
