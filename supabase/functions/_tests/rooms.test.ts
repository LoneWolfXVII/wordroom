/**
 * Room codes, request validation, and the translation of the three failures
 * `join-room` has to surface cleanly.
 *
 * Capacity, case-insensitive name uniqueness and one-seat-per-account are all
 * enforced by the database (a trigger and two unique indexes in
 * 20260908000100_init.sql). Application code deliberately does not pre-check
 * them — two players can pass a `select count(*)` at the same instant. What is
 * testable here, and what matters to the UI, is that each rejection comes back
 * as a specific code rather than as raw Postgres text.
 */

import { assert, assertEquals } from '@std/assert'
import { CODE_ALPHABET, CODE_LENGTH, MAX_PLAYERS } from '@wordroom/shared'
import { CODE_PATTERN, generateRoomCode, isValidCode, normaliseCode } from '../_shared/codes.ts'
import { mapPostgresError } from '../_shared/errors.ts'
import { createRoomSchema, joinRoomSchema } from '../_shared/schemas.ts'

Deno.test('generated codes match the alphabet and the check constraint', () => {
  for (let i = 0; i < 500; i++) {
    const code = generateRoomCode()
    assertEquals(code.length, CODE_LENGTH)
    assert(CODE_PATTERN.test(code), `${code} fails rooms_code_format`)
    for (const character of code) {
      assert(CODE_ALPHABET.includes(character), `${character} is not in CODE_ALPHABET`)
    }
  }
})

Deno.test('codes never contain the characters that get misread', () => {
  const banned = ['0', 'O', '1', 'I']
  const sample = Array.from({ length: 500 }, () => generateRoomCode()).join('')
  for (const character of banned) {
    assert(!sample.includes(character), `${character} should never appear in a code`)
  }
})

Deno.test('code generation covers the alphabet rather than favouring a corner', () => {
  const sample = Array.from({ length: 2000 }, () => generateRoomCode()).join('')
  assertEquals(new Set(sample).size, CODE_ALPHABET.length)
})

Deno.test('codes are read back case-insensitively', () => {
  assertEquals(normaliseCode(' khxq '), 'KHXQ')
  assert(isValidCode('khxq'))
  assert(!isValidCode('KHXO'))
  assert(!isValidCode('KHX'))
})

Deno.test('join-room accepts a lowercase code and normalises it', () => {
  const parsed = joinRoomSchema.parse({ code: ' khxq ', playerName: ' Sam ' })
  assertEquals(parsed.code, 'KHXQ')
  assertEquals(parsed.playerName, 'Sam')
})

Deno.test('names are bounded the way the players_name_length constraint is', () => {
  assert(joinRoomSchema.safeParse({ code: 'KHXQ', playerName: 'a'.repeat(20) }).success)
  assert(!joinRoomSchema.safeParse({ code: 'KHXQ', playerName: 'a'.repeat(21) }).success)
  assert(!joinRoomSchema.safeParse({ code: 'KHXQ', playerName: '   ' }).success)
  // Control and format characters would render as an invisible or spoofed name.
  assert(!joinRoomSchema.safeParse({ code: 'KHXQ', playerName: 'Sam\u0000' }).success)
  assert(!joinRoomSchema.safeParse({ code: 'KHXQ', playerName: 'Sam\u202e' }).success)
})

Deno.test('create-room validates the timezone it will store on the room', () => {
  assert(
    createRoomSchema.safeParse({
      roomName: 'Friday Crew',
      playerName: 'Nisc',
      timezone: 'Europe/London',
    }).success,
  )
  assert(
    !createRoomSchema.safeParse({
      roomName: 'Friday Crew',
      playerName: 'Nisc',
      timezone: 'Mars/Olympus',
    }).success,
  )
  // Omitted is fine — the handler falls back to UTC.
  assert(createRoomSchema.safeParse({ roomName: 'Crew', playerName: 'Nisc' }).success)
})

Deno.test(`capacity of ${MAX_PLAYERS} surfaces as room_full, not a trigger message`, () => {
  const mapped = mapPostgresError({
    code: '23514',
    message: 'room is full (8 of 8 players)',
    details: null,
  })
  assertEquals(mapped.code, 'room_full')
  assertEquals(mapped.status, 409)
  assertEquals(mapped.message, 'This room is full.')
  assert(!mapped.message.includes('23514'))
})

Deno.test('a duplicate name surfaces as name_taken', () => {
  const mapped = mapPostgresError({
    code: '23505',
    message: 'duplicate key value violates unique constraint "players_room_name_key"',
    details: 'Key (room_id, lower(name))=(...) already exists.',
  })
  assertEquals(mapped.code, 'name_taken')
  assertEquals(mapped.status, 409)
})

Deno.test('a second seat for the same account surfaces as already_joined', () => {
  const mapped = mapPostgresError({
    code: '23505',
    message: 'duplicate key value violates unique constraint "players_room_auth_key"',
  })
  assertEquals(mapped.code, 'already_joined')
})

Deno.test('a code collision surfaces as code_unavailable so create-room can retry', () => {
  const mapped = mapPostgresError({
    code: '23505',
    message: 'duplicate key value violates unique constraint "rooms_code_key"',
  })
  assertEquals(mapped.code, 'code_unavailable')
})

Deno.test('an attempt to rename a player is refused', () => {
  const mapped = mapPostgresError({
    code: '23514',
    message: 'player names are locked and cannot be changed',
  })
  assertEquals(mapped.status, 403)
})

Deno.test('an unrecognised failure becomes a plain 500 with no schema detail in it', () => {
  const mapped = mapPostgresError({
    code: '42703',
    message: 'column "answer" does not exist',
  })
  assertEquals(mapped.code, 'internal')
  assertEquals(mapped.status, 500)
  assert(!mapped.message.includes('answer'))
})

Deno.test('the code pattern is the alphabet, so a digit no room can have is refused', () => {
  // 20260908002000_letters_only_codes.sql made codes letters-only. The pattern
  // here once still allowed 2-9, so join-room accepted a code that could not
  // exist and answered "no room has that code" instead of "that is not a code".
  assert(!isValidCode('KHX7'))
  assert(!isValidCode('2345'))
  assert(!joinRoomSchema.safeParse({ code: 'KHX7', playerName: 'Sam' }).success)
  assert(isValidCode('KHXQ'))
})

Deno.test('code generation is unbiased across the alphabet', () => {
  /*
   * 256 is not a multiple of 24, so a naive `byte % 24` gives the first 16
   * letters 11 chances in 256 and the last 8 only 10 — a 3.1% skew. Rejection
   * sampling removes it, and this is what would notice if it came back.
   *
   * The sample size is doing real work here, so the arithmetic is written down.
   * Per-letter counts are binomial: sigma = sqrt(n·p·(1-p)) with p = 1/24. At
   * the previous 48,000 letters that is sigma/mu = 2.19%, so the 8% tolerance
   * sat at 3.65 sigma — across 24 letters, a **0.62% chance of failing a run
   * that was perfectly fine**, which is once every 160 runs. It duly did, on a
   * pull request that changed nothing near it: `V: 2161 vs 2000`.
   *
   * Loosening the tolerance was not available: anything past 3.1% stops
   * catching the bias the test exists for. So the samples go up instead. At
   * 800,000 letters sigma/mu is 0.54%, which puts a 2.5% tolerance at 4.7 sigma
   * — a false failure about once in thirteen thousand runs — while still
   * catching a 3.1% skew comfortably. Costs about 170ms.
   */
  const CODES = 200_000
  const counts = new Map<string, number>()
  for (let i = 0; i < CODES; i++) {
    for (const character of generateRoomCode()) {
      counts.set(character, (counts.get(character) ?? 0) + 1)
    }
  }
  const expected = (CODES * 4) / CODE_ALPHABET.length
  for (const character of CODE_ALPHABET) {
    const count = counts.get(character) ?? 0
    assert(
      Math.abs(count - expected) < expected * 0.025,
      `${character}: ${count} vs ${expected} — outside 2.5%, which is 4.7 sigma`,
    )
  }
})
