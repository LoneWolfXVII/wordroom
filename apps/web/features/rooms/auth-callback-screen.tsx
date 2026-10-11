'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button, Icon, Screen, ScreenFooter, TileArt, toast } from '@/components/ui'
import { GoogleIcon, PlayersIcon } from '@/components/ui/icons'
import { readAuthFailure } from './auth-error'
import { resolveRoomsError } from './errors'
import { signInWithGoogle } from './identity'
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
  const [switching, setSwitching] = useState(false)
  const [switchProblem, setSwitchProblem] = useState<string | null>(null)

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
            <TileArt variant="lost" />
            <h1 className="text-[19px] leading-tight font-semibold text-ink">{failure.title}</h1>
            <p className="mt-2 text-[14px] leading-[1.45] text-ink-2">{failure.detail}</p>
            {switchProblem ? (
              <p className="mt-2 text-[14px] leading-[1.45] text-danger">{switchProblem}</p>
            ) : null}
          </>
        ) : (
          <p className="text-[15px] text-ink-2">Signing you in…</p>
        )}
      </div>

      {failure || slow ? (
        <ScreenFooter>
          {failure?.canSwitch ? (
            // Home, not the stored return path: that pointed into the guest's
            // room, which the account being signed in to does not hold.
            <Button
              variant="primary"
              loading={switching}
              onClick={async () => {
                setSwitching(true)
                setSwitchProblem(null)
                try {
                  await signInWithGoogle('/')
                } catch (error) {
                  setSwitchProblem(resolveRoomsError(error).message)
                  setSwitching(false)
                }
              }}
            >
              <Icon icon={GoogleIcon} size={18} />
              Sign in to that account
            </Button>
          ) : null}
          <Button
            variant={failure?.canSwitch ? 'default' : 'primary'}
            onClick={() => router.replace(getReturnPath() ?? '/lobby')}
          >
            <Icon icon={PlayersIcon} size={18} />
            Back to your room
          </Button>
        </ScreenFooter>
      ) : null}
    </Screen>
  )
}
