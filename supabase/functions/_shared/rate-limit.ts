/**
 * Per-caller rate limiting.
 *
 * The counter lives in Postgres, not in the isolate. Edge Functions scale to
 * many isolates and each one is short lived, so an in-memory map would give an
 * attacker a fresh budget on every cold start — which is to say, no limit at
 * all. `public.rate_limit_hit` is a single atomic upsert; see the migration
 * 20260908001000_rate_limits.sql.
 *
 * The key is the authenticated user id, so a limit follows the account rather
 * than the IP. Anonymous sign-ups are free, so this is not a hard wall — it is
 * there to stop a loop, not a determined attacker. The 6-guess cap per attempt
 * is what actually bounds guessing.
 */

import type { ServiceClient } from './db.ts'
import { AppError } from './errors.ts'

export interface RateLimit {
  /** Requests allowed inside the window. */
  max: number
  windowSeconds: number
}

/** Room creation is cheap for us and spammy in aggregate; keep it tight. */
export const CREATE_ROOM_LIMIT: RateLimit = { max: 10, windowSeconds: 3600 }

/** Joining is a burst of retries when someone mistypes a code. */
export const JOIN_ROOM_LIMIT: RateLimit = { max: 30, windowSeconds: 3600 }

/**
 * A fast human plays maybe one guess every few seconds. 60/min leaves plenty of
 * headroom for several puzzles back to back while stopping a scripted loop.
 */
export const SUBMIT_GUESS_LIMIT: RateLimit = { max: 60, windowSeconds: 60 }

interface RateLimitResult {
  allowed: boolean
  remaining: number
  retry_after_seconds: number
}

/**
 * Count one request against `bucket:userId`. Throws 429 when over the limit.
 *
 * Fails open: if the counter itself errors, the request proceeds. A broken
 * limiter must not take the game down.
 */
export async function enforceRateLimit(
  db: ServiceClient,
  bucket: string,
  userId: string,
  limit: RateLimit,
): Promise<void> {
  const { data, error } = await db.rpc('rate_limit_hit', {
    p_key: `${bucket}:${userId}`,
    p_window_seconds: limit.windowSeconds,
    p_max_hits: limit.max,
  })

  if (error) {
    console.error('rate limiter unavailable, allowing request', error)
    return
  }

  const result = (Array.isArray(data) ? data[0] : data) as RateLimitResult | undefined
  if (!result || result.allowed) return

  throw new AppError('rate_limited', 429, 'Too many requests. Wait a moment and try again.', {
    retryAfterSeconds: Math.max(result.retry_after_seconds, 1),
  })
}
