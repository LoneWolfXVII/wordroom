'use client'

import { ApiError } from './errors'
import { getHandoffToken, setHandoffToken, setReturnPath } from './storage'

/**
 * Signing in, without leaving the guest's rooms behind.
 *
 * Signing in replaces the anonymous user, and `players` points at the
 * anonymous user's id. So before leaving for Google or sending an email link,
 * a guest asks the database for a one-time handoff token and keeps it in this
 * browser. Back from the provider, the account redeems it with
 * `claimGuestSeats`, and the guest's seats become the account's. One path for
 * everyone: a new player and a returning one both take a single trip.
 *
 * This replaced *linking* the identity onto the guest, which kept the user id
 * but failed for any account that already existed — the returning player — who
 * then had to sign in a second time and lost their guest rooms anyway. See
 * `20261011000100_seat_handoff.sql`.
 */

export const IDENTITY_CALLBACK_PATH = '/auth/callback'

async function client() {
  const { getBrowserClient } = await import('@/lib/supabase')
  return getBrowserClient()
}

/**
 * Get a handoff token while this browser is still the guest.
 *
 * A failure stops the sign-in: going ahead would leave the rooms behind
 * silently, which is the thing this exists to prevent.
 */
async function prepareHandoff(): Promise<void> {
  const supabase = await client()
  const { data: session } = await supabase.auth.getSession()
  if (session.session?.user.is_anonymous !== true) return

  const { data, error } = await supabase.rpc('begin_seat_handoff')
  const token = (data as { token?: unknown } | null)?.token
  if (error || typeof token !== 'string') {
    throw new ApiError('handoff_failed', 'Could not get your rooms ready to move. Try again.')
  }
  setHandoffToken(token)
}

/**
 * Send the player to Google, and come back here.
 *
 * `returnPath` is remembered rather than encoded in `redirectTo`, because every
 * redirect URL has to be on the provider's allow-list and a per-room URL could
 * not be. The callback screen reads it back.
 */
export async function signInWithGoogle(returnPath: string): Promise<void> {
  await prepareHandoff()
  setReturnPath(returnPath)
  const supabase = await client()
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}${IDENTITY_CALLBACK_PATH}` },
  })
  if (error) {
    throw new ApiError(
      'identity_link_failed',
      error.message || 'Could not open Google sign-in. Try again.',
    )
  }
  // On success the browser is already navigating away.
}

/** Sign in by emailed link. New addresses get an account; known ones sign in. */
export async function signInWithEmail(email: string, returnPath: string): Promise<void> {
  await prepareHandoff()
  setReturnPath(returnPath)
  const supabase = await client()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${window.location.origin}${IDENTITY_CALLBACK_PATH}` },
  })
  if (error) {
    throw new ApiError(
      'identity_link_failed',
      error.message || 'Could not send the link. Check the address and try again.',
    )
  }
}

export interface ClaimResult {
  moved: number
  /** Guest seats left with the guest, because the account was already in that room. */
  kept: number
}

/**
 * Move this browser's guest seats to the account now signed in.
 *
 * Safe to call more than once: the token is cleared only once the database has
 * answered, and redeeming one twice moves nothing the second time.
 */
export async function claimGuestSeats(): Promise<ClaimResult> {
  const token = getHandoffToken()
  if (!token) return { moved: 0, kept: 0 }

  const supabase = await client()
  const { data, error } = await supabase.rpc('claim_seat_handoff', { p_token: token })
  const result = data as Partial<ClaimResult> & { error?: { code: string } }
  if (error || !result || result.error) {
    // Signed in as a guest again somehow: nothing to redeem against, so stop
    // trying rather than failing every visit.
    if (result?.error?.code === 'not_signed_in') return { moved: 0, kept: 0 }
    throw new ApiError('handoff_failed', 'Could not move your guest rooms over. Try again.')
  }
  setHandoffToken(null)
  return { moved: result.moved ?? 0, kept: result.kept ?? 0 }
}

/** A format check only — the confirmation email is what actually proves it. */
export function looksLikeEmail(value: string): boolean {
  const trimmed = value.trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)
}
