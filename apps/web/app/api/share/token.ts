import type { Mark, MarkRow } from '@wordroom/shared'

/**
 * The capability token that the share-image endpoint runs on.
 *
 * # Why the attempt id is not enough
 *
 * `/api/share/<attemptId>.png` is fetched by an `<img>` tag, by WhatsApp's
 * scraper and by Instagram's — none of which send a bearer token, a cookie or
 * anything else that says who is asking. The endpoint therefore cannot
 * authenticate the *reader*, and an attempt id in a URL is a bare identifier: if
 * the id alone were sufficient, anyone who saw one could ask the server to draw
 * that player's guesses, and the with-letters variant of a solved puzzle draws
 * the answer.
 *
 * So the endpoint authenticates at *mint* time instead, and hands out a
 * capability. `POST /api/share/<attemptId>` requires the caller's Supabase
 * access token, reads the attempt back through `my_attempts` — a view that
 * filters on `auth.uid()`, so RLS decides ownership, not this code — refuses
 * anything unfinished, and returns a token. `GET` then renders whatever that
 * token carries and nothing else.
 *
 * Three properties follow, and they are the whole security argument:
 *
 *  1. **The renderer has no database.** It draws the token's contents. There is
 *     no id it can be pointed at to make it fetch someone else's attempt,
 *     because it never fetches anything.
 *  2. **A spoiler-free token contains no letters at all.** Not redacted, not
 *     ignored by the renderer — absent from the signed bytes. The default share
 *     cannot leak a word even if the drawing code were wrong.
 *  3. **A with-letters token is unguessable and only its owner can mint it.**
 *     It is HMAC-SHA256 signed with a server-only secret, so it cannot be forged
 *     or edited, and it can only be minted by someone holding the access token
 *     of the player whose attempt it is, for an attempt that has *finished*. An
 *     in-progress attempt is refused at mint, so letters for a live puzzle do
 *     not exist in token form anywhere.
 *
 * A token that leaks reveals exactly what its holder was already shown by the
 * person who chose to share it. That is the same exposure as the share *text*,
 * which is the bar the build plan sets.
 */

/** Mark names compress to their first letter. `m: ['aaapa', 'cpaaa']`. */
const MARK_CHARS: Readonly<Record<Mark, string>> = {
  correct: 'c',
  present: 'p',
  absent: 'a',
}

const CHAR_MARKS: Readonly<Record<string, Mark>> = {
  c: 'correct',
  p: 'present',
  a: 'absent',
}

/**
 * How long a token stays renderable.
 *
 * The two variants get different lives on purpose. A colour grid is already
 * readable by the whole room — `attempts.marks` is granted to every member — so
 * a spoiler-free card can outlive the chat it was pasted into. A letters card is
 * a spoiler, and every day it keeps working is another day a forwarded link can
 * ruin a puzzle number for someone who has not played it yet. A week is long
 * enough for the conversation it belongs to and short enough to expire before
 * the room has moved on.
 */
export const SPOILER_FREE_TTL_SECONDS = 60 * 60 * 24 * 365
export const WITH_LETTERS_TTL_SECONDS = 60 * 60 * 24 * 7

/**
 * The signed body. Keys are one character because the whole thing rides in a
 * query string that has to survive being pasted into a chat window.
 */
export interface SharePayload {
  /** Format version, so an old token in an old message fails cleanly. */
  v: 1
  /** Attempt id. Checked against the path, so a token is not portable. */
  a: string
  /** Puzzle number. */
  n: number
  /** Room code, for the link line. */
  c: string
  s: boolean
  h: boolean
  /** Elapsed ms, or null when the timer was off. */
  t: number | null
  /** Compact mark rows, one per guess. */
  m: string[]
  /** The guessed words. Present only on a with-letters token. */
  w?: string[]
  /** Expiry, epoch seconds. */
  x: number
}

export function encodeMarksCompact(rows: readonly MarkRow[]): string[] {
  return rows.map((row) => row.map((mark) => MARK_CHARS[mark]).join(''))
}

export function decodeMarksCompact(rows: readonly string[]): MarkRow[] {
  return rows.map((row) =>
    row.split('').map((char) => {
      const mark = CHAR_MARKS[char]
      if (!mark) throw new Error(`decodeMarksCompact: unknown mark ${JSON.stringify(char)}`)
      return mark
    }),
  )
}

const encoder = new TextEncoder()

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function base64UrlDecode(value: string): Uint8Array | null {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/')
  try {
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

/** XOR-accumulating compare, so a wrong signature costs the same as a right one. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diff === 0
}

/** `<base64url payload>.<base64url signature>`. */
export async function signShareToken(payload: SharePayload, secret: string): Promise<string> {
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)))
  const key = await hmacKey(secret)
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)))
  return `${body}.${base64UrlEncode(signature)}`
}

export type TokenFailure = 'malformed' | 'bad_signature' | 'expired' | 'unsupported_version'

export type TokenResult = { ok: true; payload: SharePayload } | { ok: false; reason: TokenFailure }

/**
 * Verify, then parse. In that order — nothing decides anything about a token's
 * contents until the signature says we wrote them.
 */
export async function verifyShareToken(
  token: string,
  secret: string,
  now: number = Date.now(),
): Promise<TokenResult> {
  const dot = token.indexOf('.')
  if (dot <= 0 || dot === token.length - 1) return { ok: false, reason: 'malformed' }

  const body = token.slice(0, dot)
  const provided = base64UrlDecode(token.slice(dot + 1))
  if (!provided) return { ok: false, reason: 'malformed' }

  const key = await hmacKey(secret)
  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)))
  if (!timingSafeEqual(provided, expected)) return { ok: false, reason: 'bad_signature' }

  const decoded = base64UrlDecode(body)
  if (!decoded) return { ok: false, reason: 'malformed' }

  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(decoded))
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  const payload = asPayload(parsed)
  if (!payload) return { ok: false, reason: 'unsupported_version' }
  if (payload.x * 1000 <= now) return { ok: false, reason: 'expired' }

  return { ok: true, payload }
}

/**
 * Shape check after the signature has already passed.
 *
 * The signature proves we minted these bytes, so this is not defending against
 * an attacker — it is defending against a token minted by an older deploy with a
 * different shape, which must fail as a broken image rather than as a crash
 * halfway through drawing.
 */
function asPayload(value: unknown): SharePayload | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  if (raw.v !== 1) return null

  const { a, n, c, s, h, t, m, w, x } = raw
  if (typeof a !== 'string' || typeof c !== 'string') return null
  if (typeof n !== 'number' || typeof x !== 'number') return null
  if (typeof s !== 'boolean' || typeof h !== 'boolean') return null
  if (t !== null && typeof t !== 'number') return null
  if (!isStringArray(m)) return null
  if (w !== undefined && !isStringArray(w)) return null
  if (w !== undefined && w.length !== m.length) return null

  const payload: SharePayload = { v: 1, a, n, c, s, h, t, m, x }
  return w === undefined ? payload : { ...payload, w }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

/**
 * The signing secret.
 *
 * In production it must be configured; a missing secret makes the endpoint
 * refuse to mint rather than fall back to something guessable. In development it
 * is a fixed string so that a token minted by one `next dev` still renders after
 * a restart, which is the difference between being able to open the image in a
 * browser and not.
 */
export const DEV_SHARE_SECRET = 'wordroom-dev-share-secret'

export function shareTokenSecret(): string | null {
  const configured = process.env.SHARE_TOKEN_SECRET
  if (configured) return configured
  return process.env.NODE_ENV === 'production' ? null : DEV_SHARE_SECRET
}
