'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { Button, Icon, Screen, ScreenFooter, TileArt, toast } from '@/components/ui'
import { PlayersIcon } from '@/components/ui/icons'
import { readAuthFailure } from './auth-error'
import { resolveRoomsError } from './errors'
import { claimGuestSeats } from './identity'
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
 * Once signed in, the guest's seats are moved to the account before leaving, so
 * the room the player came from is theirs by the time they land back in it.
 */
export function AuthCallbackScreen() {
  const router = useRouter()
  const params = useSearchParams()
  const { status, isAnonymous } = useSession()
  const queryClient = useQueryClient()
  const [slow, setSlow] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [claimProblem, setClaimProblem] = useState<string | null>(null)

  // The provider reports a refusal in the query string rather than by failing
  // the redirect, and each refusal needs a different sentence — see auth-error.
  const failure = readAuthFailure(params)

  const finish = useCallback(async () => {
    setClaiming(true)
    setClaimProblem(null)
    try {
      const { kept } = isAnonymous ? { kept: 0 } : await claimGuestSeats()
      await queryClient.invalidateQueries({ queryKey: ['rooms'] })
      const destination = getReturnPath() ?? '/'
      setReturnPath(null)
      if (!isAnonymous) {
        toast(
          kept > 0
            ? 'Signed in. You were already in one of those rooms, so your account kept its seat there.'
            : 'Signed in',
        )
      }
      router.replace(destination)
    } catch (error) {
      setClaimProblem(resolveRoomsError(error).message)
      setClaiming(false)
    }
  }, [isAnonymous, queryClient, router])

  useEffect(() => {
    if (failure || status !== 'ready') return
    void finish()
  }, [failure, status, finish])

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
          </>
        ) : claimProblem ? (
          <>
            <h1 className="text-[19px] leading-tight font-semibold text-ink">
              You're signed in, but your rooms didn't come along.
            </h1>
            <p className="mt-2 text-[14px] leading-[1.45] text-ink-2">{claimProblem}</p>
          </>
        ) : (
          <p className="text-[15px] text-ink-2">Signing you in…</p>
        )}
      </div>

      {claimProblem ? (
        <ScreenFooter>
          <Button variant="primary" loading={claiming} onClick={() => void finish()}>
            Try again
          </Button>
        </ScreenFooter>
      ) : failure || slow ? (
        <ScreenFooter>
          <Button variant="primary" onClick={() => router.replace(getReturnPath() ?? '/')}>
            <Icon icon={PlayersIcon} size={18} />
            Back to your room
          </Button>
        </ScreenFooter>
      ) : null}
    </Screen>
  )
}
