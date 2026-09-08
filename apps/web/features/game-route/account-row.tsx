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

  const signedIn = !isAnonymous && email !== null

  return (
    <>
      <SettingRow
        label="Account"
        hint={signedIn ? email : 'Playing as guest on this device'}
        control={
          signedIn ? null : (
            <Button size="sm" onClick={() => setOpen((was) => !was)} aria-expanded={open}>
              {open ? 'Not now' : 'Sign in'}
            </Button>
          )
        }
      />

      {signedIn ? null : (
        <Expand open={open} maxHeight={260}>
          <div className="pb-1">
            <SignInPanel returnPath={returnPath} onEmailSent={() => setOpen(false)} />
          </div>
        </Expand>
      )}
    </>
  )
}
