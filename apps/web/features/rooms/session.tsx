'use client'

import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { createContext, type ReactNode, use, useEffect, useMemo, useState } from 'react'
import { getBrowserClient } from '@/lib/supabase'
import { SupabaseConfigError } from '@/lib/supabase/env'

/**
 * Anonymous auth, established on first load.
 *
 * Every screen in the product needs a bearer token: the Edge Functions demand
 * one, and RLS gives `anon` no grant on any table that matters. So the very
 * first thing that happens in a fresh browser is `signInAnonymously()`, before
 * the player has typed anything or agreed to anything.
 *
 * That user id is the durable identity. `players.auth_user_id` points at it, so
 * linking a real account later — see `identity.ts` — keeps the same id and
 * therefore the same room and the same locked name.
 */

export type SessionStatus = 'loading' | 'ready' | 'error'

export interface SessionState {
  status: SessionStatus
  session: Session | null
  userId: string | null
  /** True while the account is still the throwaway one auth created. */
  isAnonymous: boolean
  /** Set when the account has been upgraded; shown in the settings sheet. */
  email: string | null
  error: Error | null
  /** Re-read the session after a link. Cheap; does not hit the network. */
  refresh: () => Promise<void>
}

const SessionContext = createContext<SessionState | null>(null)

/**
 * StrictMode mounts effects twice in development, and two concurrent
 * `signInAnonymously()` calls create two throwaway users — the second of which
 * silently replaces the first, orphaning any room it had joined. Sharing one
 * in-flight promise at module scope makes the second mount await the first.
 */
let signInInFlight: Promise<void> | null = null

async function ensureSession(client: SupabaseClient): Promise<Session | null> {
  const { data } = await client.auth.getSession()
  if (data.session) return data.session

  signInInFlight ??= client.auth
    .signInAnonymously()
    .then(({ error }) => {
      if (error) throw error
    })
    .finally(() => {
      signInInFlight = null
    })

  await signInInFlight
  const { data: after } = await client.auth.getSession()
  return after.session
}

/** Supabase reports an anonymous user with a claim, not a flag on the row. */
function readIsAnonymous(session: Session | null): boolean {
  if (!session) return true
  const claim: unknown = session.user.is_anonymous
  return claim !== false
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<SessionStatus>('loading')
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let active = true

    let client: SupabaseClient
    try {
      client = getBrowserClient()
    } catch (caught) {
      setError(
        caught instanceof SupabaseConfigError ? caught : new Error('Could not start a session.'),
      )
      setStatus('error')
      return
    }

    // Subscribed before the sign-in so the resulting SIGNED_IN event is caught
    // rather than raced.
    const { data: subscription } = client.auth.onAuthStateChange((_event, next) => {
      if (!active) return
      setSession(next)
      if (next) setStatus('ready')
    })

    ensureSession(client)
      .then((resolved) => {
        if (!active) return
        setSession(resolved)
        setStatus(resolved ? 'ready' : 'error')
        if (!resolved) {
          setError(new Error('Could not start a session. Anonymous sign-in may be disabled.'))
        }
      })
      .catch((caught: unknown) => {
        if (!active) return
        setError(caught instanceof Error ? caught : new Error('Could not start a session.'))
        setStatus('error')
      })

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<SessionState>(
    () => ({
      status,
      session,
      userId: session?.user.id ?? null,
      isAnonymous: readIsAnonymous(session),
      email: session?.user.email ?? null,
      error,
      refresh: async () => {
        const { data } = await getBrowserClient().auth.getSession()
        setSession(data.session)
      },
    }),
    [status, session, error],
  )

  return <SessionContext value={value}>{children}</SessionContext>
}

export function useSession(): SessionState {
  const value = use(SessionContext)
  if (!value) throw new Error('useSession must be used inside <RoomsProvider>.')
  return value
}
