'use client'

import { useState } from 'react'
import { Button, Expand, SettingRow } from '@/components/ui'
import { SignInPanel, useSession } from '@/features/rooms'

/**
 * The Account row in the settings sheet.
 *
 * `SettingsSheet`'s `footer` is documented as taking `SettingRow`s and nothing
 * else, so that account and rules sit as siblings of Timer and Hard mode. It was
 * being handed a bare `SignInPanel`, which put a full-width "Continue with
 * Google" button under Hard mode with no label on it — the one control in the
 * sheet that did not say what it was for.
 *
 * The row reads as a setting; the sign-in choices only appear once asked for,
 * because signing in is an action rather than a preference, and the sheet should
 * not open with a Google button already shouting at a player who did not ask.
 */
export function AccountSettingRow({ returnPath }: { returnPath: string }) {
  const { isAnonymous, email } = useSession()
  const [open, setOpen] = useState(false)

  // `Expand` animates height, so the panel below stays mounted while collapsed
  // and keeps whatever state it was left in. That made "Not now" a lie: it hid
  // a half-typed address, or a spinner from a Google trip the player had
  // already abandoned, and put both straight back on the next "Sign in".
  // Bumping the key on the way open gives them a panel that has not been used.
  const [session, setSession] = useState(0)

  const toggle = () => {
    if (!open) setSession((n) => n + 1)
    setOpen((was) => !was)
  }

  const signedIn = !isAnonymous && email !== null

  return (
    <>
      <SettingRow
        label="Account"
        hint={signedIn ? email : 'Playing as guest on this device'}
        control={
          signedIn ? null : (
            <Button size="sm" onClick={toggle} aria-expanded={open}>
              {open ? 'Not now' : 'Sign in'}
            </Button>
          )
        }
      />

      {signedIn ? null : (
        <Expand open={open} maxHeight={260}>
          <div className="pb-1">
            <SignInPanel key={session} returnPath={returnPath} onEmailSent={() => setOpen(false)} />
          </div>
        </Expand>
      )}
    </>
  )
}
