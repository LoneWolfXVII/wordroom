/**
 * Room codes.
 *
 * `CODE_ALPHABET` is 24 letters, which does not divide 256, so a plain
 * `byte % 24` would favour A–P by a tenth. Bytes outside the largest multiple
 * of the alphabet are rejected and redrawn instead. Using
 * `crypto.getRandomValues` rather than `Math.random` matters: a code is the
 * only thing standing between a stranger and a room's join screen.
 */

import { CODE_ALPHABET, CODE_LENGTH } from '@wordroom/shared'

/** The largest multiple of the alphabet size that fits in a byte. */
const UNBIASED_LIMIT = 256 - (256 % CODE_ALPHABET.length)

export function generateRoomCode(length: number = CODE_LENGTH): string {
  let code = ''
  const bytes = new Uint8Array(length * 2)
  while (code.length < length) {
    crypto.getRandomValues(bytes)
    for (const byte of bytes) {
      if (byte >= UNBIASED_LIMIT) continue
      code += CODE_ALPHABET[byte % CODE_ALPHABET.length] ?? CODE_ALPHABET[0]
      if (code.length === length) break
    }
  }
  return code
}

/**
 * Mirrors the `rooms_code_format` check constraint, and is derived from the
 * alphabet so the two cannot drift apart again: this pattern once still allowed
 * the digits 2–9 after 20260908002000_letters_only_codes.sql had removed them,
 * so `join-room` would accept a code no room could have and the schema's error
 * message described an alphabet that no longer existed.
 */
export const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`)

export function normaliseCode(raw: string): string {
  return raw.trim().toUpperCase()
}

export function isValidCode(raw: string): boolean {
  return CODE_PATTERN.test(normaliseCode(raw))
}
