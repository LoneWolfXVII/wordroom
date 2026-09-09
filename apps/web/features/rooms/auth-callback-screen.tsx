'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button, Icon, Screen, ScreenFooter, toast } from '@/components/ui'
import { PlayersIcon } from '@/components/ui/icons'
import { AuthFailureArt } from './auth-art'
import { readAuthFailure } from './auth-error'
import { useSession } from './session'
import { getReturnPath, setReturnPath } from './storage'

/**
 * Where Google and the emailed link come back to.
 *
 * The code exchange itself is not done here: the browser client is built with
 * `detectSessionInUrl`, so constructing it on this page — which `useSession`
 * does — consumes the `?code=` and stores the upgraded session. This screen only
 * waits for that to land and then puts the player back where they were.
 *
 * The user id does not change across a link, so there is nothing to migrate:
 * the `players` row, the room and the locked name are already correct.
 */
export function AuthCallbackScreen() {
  const router = useRouter()
  const params = useSearchParams()
  const { status, isAnonymous } = useSession()
  const [slow, setSlow] = useState(false)

  // The provider reports a refusal in the query string rather than by failing
  // the redirect, and each refusal needs a different sentence — see auth-error.
  const failure = readAuthFailure(params)

  useEffect(() => {
    if (failure || status !== 'ready') return
    const destination = getReturnPath() ?? '/lobby'
    setReturnPath(null)
    if (!isAnonymous) toast('Signed in')
    router.replace(destination)
  }, [failure, status, isAnonymous, router])

  // If the exchange never resolves, offer a way out rather than a spinner
  // that never stops.
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 6000)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <Screen>
      <div className="m-auto max-w-[32ch] text-center">
        {failure ? (
          <>
            <AuthFailureArt />
            <h1 className="text-[19px] leading-tight font-semibold text-ink">{failure.title}</h1>
            <p className="mt-2 text-[14px] leading-[1.45] text-ink-2">{failure.detail}</p>
          </>
        ) : (
          <p className="text-[15px] text-ink-2">Signing you in…</p>
        )}
      </div>

      {failure || slow ? (
        <ScreenFooter>
          <Button variant="primary" onClick={() => router.replace(getReturnPath() ?? '/lobby')}>
            <Icon icon={PlayersIcon} size={18} />
            Back to your room
          </Button>
        </ScreenFooter>
      ) : null}
    </Screen>
  )
}
