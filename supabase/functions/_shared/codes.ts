/**
 * Room codes.
 *
 * `CODE_ALPHABET` has exactly 32 characters, so 256 divides evenly by it and a
 * plain `byte % 32` is unbiased — no rejection sampling needed. Using
 * `crypto.getRandomValues` rather than `Math.random` matters: a code is the
 * only thing standing between a stranger and a room's join screen.
 */

import { CODE_ALPHABET, CODE_LENGTH } from '@wordroom/shared'

export function generateRoomCode(length: number = CODE_LENGTH): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)

  let code = ''
  for (const byte of bytes) {
    code += CODE_ALPHABET[byte % CODE_ALPHABET.length] ?? CODE_ALPHABET[0]
  }
  return code
}

/** Mirrors the `rooms_code_format` check constraint. */
export const CODE_PATTERN = /^[2-9A-HJ-NP-Z]{4}$/

export function normaliseCode(raw: string): string {
  return raw.trim().toUpperCase()
}

export function isValidCode(raw: string): boolean {
  return CODE_PATTERN.test(normaliseCode(raw))
}
