import { CODE_ALPHABET, CODE_LENGTH } from '@wordroom/shared'

/**
 * Room-code handling.
 *
 * The alphabet is never written out here. `CODE_ALPHABET` is the contract, and
 * the open question in CLAUDE.md — whether the final policy is letters-only or
 * the letters-and-digits superset — is settled in `@wordroom/shared` and in the
 * `rooms_code_format` constraint together. Importing it means this file needs no
 * edit when that lands.
 */

const ALLOWED = new Set(CODE_ALPHABET.split(''))

/**
 * Reduce anything a person can paste or type to a candidate code.
 *
 * Uppercases first, so a lowercase `k` survives, then drops every character the
 * alphabet does not contain — spaces, hyphens, and the four look-alikes the
 * alphabet excludes on purpose. Truncated to `CODE_LENGTH`, so pasting a whole
 * share URL yields the code and not the domain.
 */
export function normaliseCode(raw: string): string {
  return raw
    .toUpperCase()
    .split('')
    .filter((character) => ALLOWED.has(character))
    .join('')
    .slice(0, CODE_LENGTH)
}

/** True once the code is long enough to be worth sending. */
export function isCompleteCode(code: string): boolean {
  return normaliseCode(code).length === CODE_LENGTH
}

/**
 * Pull a room code out of whatever was pasted.
 *
 * Someone who is sent `wordroom.example.dev/r/KHX7` will paste the whole thing,
 * so a bare code, a `/r/CODE` path and a full URL with a query string or fragment
 * all have to work.
 *
 * The URL case cannot go through `normaliseCode` alone: stripping a URL down to
 * alphabet characters and taking the first four turns `https://…` into `HTTP`,
 * which is a well-formed code for the wrong room. So anything URL-shaped is only
 * accepted through its `/r/` segment, and returns null without one. A partial
 * paste returns null too, rather than half-filling the boxes.
 */
export function codeFromShareInput(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const match = /\/r\/([^/?#]+)/i.exec(trimmed)
  if (match?.[1] !== undefined) {
    const fromPath = normaliseCode(match[1])
    return fromPath.length === CODE_LENGTH ? fromPath : null
  }

  // No `/r/` segment: only trust this if it is not a link in the first place.
  if (/[/:?#]/.test(trimmed) || trimmed.includes('.')) return null

  const candidate = normaliseCode(trimmed)
  return candidate.length === CODE_LENGTH ? candidate : null
}
