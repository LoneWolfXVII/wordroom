'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button, Screen, ScreenFooter, toast } from '@/components/ui'
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
  // the redirect.
  const denied = params.get('error_description') ?? params.get('error')

  useEffect(() => {
    if (denied || status !== 'ready') return
    const destination = getReturnPath() ?? '/lobby'
    setReturnPath(null)
    if (!isAnonymous) toast('Signed in')
    router.replace(destination)
  }, [denied, status, isAnonymous, router])

  // If the exchange never resolves, offer a way out rather than a spinner
  // that never stops.
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 6000)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <Screen>
      <div className="m-auto max-w-[30ch] text-center">
        <p className="text-[15px] text-ink-2">
          {denied ? 'That sign-in did not complete.' : 'Signing you in…'}
        </p>
        {denied ? (
          <p className="mt-2 text-[13px] text-muted">
            Your room and your name are unchanged. You can carry on as a guest.
          </p>
        ) : null}
      </div>

      {denied || slow ? (
        <ScreenFooter>
          <Button variant="primary" onClick={() => router.replace(getReturnPath() ?? '/lobby')}>
            Back to your room
          </Button>
        </ScreenFooter>
      ) : null}
    </Screen>
  )
}
