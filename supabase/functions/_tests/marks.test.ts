/**
 * The `attempts.marks` codec.
 *
 * The leaderboard, the result sheet and the realtime payload all read this
 * column, so the format has to survive a round trip exactly.
 */

import { assertEquals, assertThrows } from '@std/assert'
import { scoreGuess } from '@wordroom/shared'
import { decodeMarkRow, decodeMarks, encodeMarkRow, encodeMarks } from '../_shared/marks.ts'

Deno.test('a row is the Mark names, comma separated, in guess order', () => {
  assertEquals(
    encodeMarkRow(scoreGuess('slate', 'stale')),
    'correct,present,correct,present,correct',
  )
})

Deno.test('round trips every mode', () => {
  for (const [guess, answer] of [
    ['slate', 'stale'],
    ['people', 'purple'],
    ['because', 'between'],
  ] as const) {
    const marks = scoreGuess(guess, answer)
    assertEquals(decodeMarkRow(encodeMarkRow(marks)), marks)
  }
})

Deno.test('round trips a whole grid', () => {
  const grid = [scoreGuess('slate', 'crane'), scoreGuess('crane', 'crane')]
  const encoded = encodeMarks(grid)
  assertEquals(encoded.length, 2)
  assertEquals(decodeMarks(encoded), grid)
})

Deno.test('a corrupt value is a loud error, not a silently wrong grid', () => {
  assertThrows(() => decodeMarkRow('correct,green,absent'))
  assertThrows(() => decodeMarkRow(''))
})

Deno.test('the encoded row never contains the guessed word', () => {
  // The whole reason the room may read `marks` but not `guesses`.
  const encoded = encodeMarkRow(scoreGuess('crane', 'crane'))
  assertEquals(encoded.includes('crane'), false)
})
