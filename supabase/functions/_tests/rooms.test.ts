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
  assertEquals(normaliseCode(' khx7 '), 'KHX7')
  assert(isValidCode('khx7'))
  assert(!isValidCode('KHXO'))
  assert(!isValidCode('KHX'))
})

Deno.test('join-room accepts a lowercase code and normalises it', () => {
  const parsed = joinRoomSchema.parse({ code: ' khx7 ', playerName: ' Sam ' })
  assertEquals(parsed.code, 'KHX7')
  assertEquals(parsed.playerName, 'Sam')
})

Deno.test('names are bounded the way the players_name_length constraint is', () => {
  assert(joinRoomSchema.safeParse({ code: 'KHX7', playerName: 'a'.repeat(20) }).success)
  assert(!joinRoomSchema.safeParse({ code: 'KHX7', playerName: 'a'.repeat(21) }).success)
  assert(!joinRoomSchema.safeParse({ code: 'KHX7', playerName: '   ' }).success)
  // Control and format characters would render as an invisible or spoofed name.
  assert(!joinRoomSchema.safeParse({ code: 'KHX7', playerName: 'Sam\u0000' }).success)
  assert(!joinRoomSchema.safeParse({ code: 'KHX7', playerName: 'Sam\u202e' }).success)
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
