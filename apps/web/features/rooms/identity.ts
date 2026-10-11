'use client'

import { ApiError } from './errors'
import { setReturnPath } from './storage'

/**
 * Upgrading an anonymous player to a real account, without losing the room.
 *
 * The whole design rests on one fact: **linking does not mint a new user.**
 * `linkIdentity` and `updateUser({ email })` both attach a credential to the
 * user that is already signed in, so `auth.uid()` is unchanged. `players` points
 * at that id, and names are immutable by database trigger, so the room and the
 * locked name come through untouched — nothing has to be migrated, and there is
 * no window where a player exists twice.
 *
 * Signing in *instead* replaces the user, and any seat the guest held stays
 * behind with it. So `signInWithGoogle` and `signInWithEmail` are only for a
 * guest with nothing to lose — a returning player on a fresh device — or one who
 * has been told what they are leaving and chosen to.
 *
 * Requires "Manual linking" to be enabled for the Supabase project; without it
 * `linkIdentity` returns 422 and the message below explains what happened.
 */

export const IDENTITY_CALLBACK_PATH = '/auth/callback'

async function client() {
  const { getBrowserClient } = await import('@/lib/supabase')
  return getBrowserClient()
}

/**
 * Send the player to Google, and come back here.
 *
 * `returnPath` is remembered rather than encoded in `redirectTo`, because every
 * redirect URL has to be on the provider's allow-list and a per-room URL could
 * not be. The callback screen reads it back.
 */
export async function linkGoogle(returnPath: string): Promise<void> {
  setReturnPath(returnPath)
  const supabase = await client()
  const { error } = await supabase.auth.linkIdentity({
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

/**
 * Attach an email address, confirmed by a link.
 *
 * `updateUser` rather than `signInWithOtp`: the second would sign a *different*
 * user in. The address is not live until the player follows the emailed link, so
 * the copy has to say a link is coming rather than that they are signed in.
 */
export async function linkEmail(email: string): Promise<void> {
  const supabase = await client()
  const { error } = await supabase.auth.updateUser(
    { email },
    { emailRedirectTo: `${window.location.origin}${IDENTITY_CALLBACK_PATH}` },
  )
  if (error) {
    // The address already belongs to another account. Not retryable as a link,
    // but the panel can offer to sign in to that account instead.
    if (error.code === 'email_exists') {
      throw new ApiError('email_exists', 'That email is already signed up.')
    }
    throw new ApiError(
      'identity_link_failed',
      error.message || 'Could not send the link. Check the address and try again.',
    )
  }
}

/** Sign in to an existing account with Google, replacing the guest. */
export async function signInWithGoogle(returnPath: string): Promise<void> {
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
}

/** Sign in to an existing account by emailed link, replacing the guest once followed. */
export async function signInWithEmail(email: string, returnPath: string): Promise<void> {
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

/** A format check only — the confirmation email is what actually proves it. */
export function looksLikeEmail(value: string): boolean {
  const trimmed = value.trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)
}
