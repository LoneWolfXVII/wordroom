'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui'
import { useSession } from './session'
import { SignInPanel } from './sign-in-panel'
import { hasSeenSavePrompt, markSavePromptSeen } from './storage'

/**
 * `.nudge` — the one time the product asks a guest to sign in.
 *
 * The spec is exact: once, after the first puzzle's result, never before. Both
 * halves are enforced here rather than by the caller.
 *
 * - *Never before* comes from where this renders. It belongs inside the result
 *   sheet and nowhere else, so it cannot appear during onboarding or mid-puzzle.
 * - *Once* comes from a flag written the moment it first appears, so a second
 *   result never shows it again — whether or not the player acted on it.
 *
 * **Workstream 2:** drop `<SaveProgressNudge />` at the bottom of the result
 * sheet and pass nothing. It renders null on its own for a signed-in player, for
 * a player who has already seen it, and before the session resolves. There is no
 * "is this the first result?" question for the game to answer.
 */
export function SaveProgressNudge({ className }: { className?: string }) {
  const { status, isAnonymous } = useSession()
  const pathname = usePathname()
  const [dismissed, setDismissed] = useState(false)

  // Read once, on mount: `hasSeenSavePrompt` is about to become true, and
  // reading it during render would make this component disappear mid-life.
  const [eligible, setEligible] = useState<boolean | null>(null)

  useEffect(() => {
    if (status !== 'ready') return
    setEligible((current) => {
      if (current !== null) return current
      if (!isAnonymous || hasSeenSavePrompt()) return false
      markSavePromptSeen()
      return true
    })
  }, [status, isAnonymous])

  if (!eligible || dismissed) return null

  return (
    <div className={className}>
      <div className="mt-[18px] animate-up rounded-md bg-surface-2 px-4 py-3.5 text-left">
        <b className="block text-sm font-semibold">Keep your name and score</b>
        <p className="mt-[3px] mb-3 text-[13px] leading-[1.4] text-ink-2">
          You're playing as a guest. Sign in so you don't lose them if you switch phones.
        </p>
        <SignInPanel
          returnPath={pathname}
          onEmailSent={() => setDismissed(true)}
          secondaryAction={
            <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
              Not now
            </Button>
          }
        />
      </div>
    </div>
  )
}
