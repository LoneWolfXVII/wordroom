import { AppError } from './errors.ts'
import { supabaseUrl } from './db.ts'

/**
 * Local verification of a Supabase access token.
 *
 * # Why not ask GoTrue
 *
 * `auth.getUser(token)` is a full HTTPS round trip to the auth server on every
 * request, and it was the single most expensive step in `submit-guess` — the
 * whole function was six sequential round trips, and a guess took ~2s.
 *
 * The trade it was making: a call to GoTrue also catches a session revoked
 * *since* the token was issued, which a signature check cannot. That is a real
 * difference, but a small one here and not one the rest of the system makes —
 * Postgres itself decides RLS from the JWT's signature alone, so `auth.uid()`
 * already trusts exactly what this now trusts. Checking harder in the function
 * than the database does buys very little, and it cost every player a second on
 * every guess. Tokens are short-lived, so the exposure is bounded by their
 * lifetime.
 *
 * # How
 *
 * The project signs with ES256 and publishes a JWKS. The keys are fetched once
 * per isolate and cached; an unknown `kid` forces one refetch, so a key
 * rotation heals without a redeploy rather than failing until one.
 */

interface Jwk {
  kid: string
  kty: string
  crv: string
  x: string
  y: string
  alg: string
}

export interface VerifiedClaims {
  sub: string
  exp: number
  is_anonymous?: boolean
}

/** Cached across invocations of a warm isolate; that is the whole point. */
let keyCache: Map<string, CryptoKey> | null = null
let inFlight: Promise<Map<string, CryptoKey>> | null = null

function decodeSegment(segment: string): string {
  const padded = segment.replaceAll('-', '+').replaceAll('_', '/')
  return atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
}

function toBytes(segment: string): Uint8Array<ArrayBuffer> {
  const binary = decodeSegment(segment)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function fetchKeys(): Promise<Map<string, CryptoKey>> {
  const response = await fetch(`${supabaseUrl()}/auth/v1/.well-known/jwks.json`)
  if (!response.ok) throw new Error(`jwks fetch failed: ${response.status}`)

  const body = (await response.json()) as { keys?: Jwk[] }
  const keys = new Map<string, CryptoKey>()

  for (const jwk of body.keys ?? []) {
    if (jwk.alg !== 'ES256' || jwk.kty !== 'EC') continue
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, ext: true },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    )
    keys.set(jwk.kid, key)
  }

  return keys
}

/** One fetch per isolate even under a burst of concurrent requests. */
function keys(force: boolean): Promise<Map<string, CryptoKey>> {
  if (!force && keyCache) return Promise.resolve(keyCache)
  if (!inFlight) {
    inFlight = fetchKeys()
      .then((fetched) => {
        keyCache = fetched
        return fetched
      })
      .finally(() => {
        inFlight = null
      })
  }
  return inFlight
}

/** Test seam. */
export function resetJwtKeyCache(): void {
  keyCache = null
  inFlight = null
}

function invalid(): AppError {
  return new AppError('unauthorized', 401, 'Your session has expired. Reload and try again.')
}

export async function verifyAccessToken(token: string): Promise<VerifiedClaims> {
  const parts = token.split('.')
  const [headerPart, payloadPart, signaturePart] = parts
  if (parts.length !== 3 || !headerPart || !payloadPart || !signaturePart) throw invalid()

  let header: { alg?: string; kid?: string }
  let claims: VerifiedClaims & { aud?: string }
  try {
    header = JSON.parse(decodeSegment(headerPart))
    claims = JSON.parse(decodeSegment(payloadPart))
  } catch {
    throw invalid()
  }

  // Only ES256. Refusing by name is what stops an `alg: none` or an HS256 token
  // signed with a public key from being accepted.
  if (header.alg !== 'ES256' || !header.kid) throw invalid()
  if (typeof claims.sub !== 'string' || claims.sub === '') throw invalid()
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()) throw invalid()

  let available = await keys(false)
  let key = available.get(header.kid)
  if (!key) {
    // Unknown kid: the project may have rotated. One refetch, then give up.
    available = await keys(true)
    key = available.get(header.kid)
  }
  if (!key) throw invalid()

  const signed = new TextEncoder().encode(`${headerPart}.${payloadPart}`)
  const ok = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    toBytes(signaturePart),
    signed,
  )
  if (!ok) throw invalid()

  return claims
}
