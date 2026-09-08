'use client'

import { CODE_LENGTH } from '@wordroom/shared'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import {
  Button,
  CodeBoxes,
  Help,
  IconButton,
  Screen,
  ScreenFooter,
  ScreenLead,
  ScreenTitle,
  ScreenTop,
} from '@/components/ui'
import { BackIcon } from '@/components/ui/icons'
import { codeFromShareInput, isCompleteCode, normaliseCode } from './code'
import { ApiError, resolveRoomsError } from './errors'
import { setPendingSeat } from './storage'

/**
 * "Enter the room code".
 *
 * The prototype looks the room up as the fourth character lands and reports
 * "Found Friday crew · 2 players". **That preview is not portable.**
 * `rooms_select_member` makes a room invisible to anyone who is not already in
 * it, so there is no query a prospective joiner can run and no Edge Function
 * that answers the question — and adding one would leak which codes are live to
 * anyone willing to enumerate 32^4 of them.
 *
 * So the code is checked when it is used, and the failures come back here:
 * `?e=<code>` is set by the name screen when what went wrong is the code rather
 * than the name. The typed code is preserved so the fix is one character, not
 * four.
 */
export function JoinRoomScreen() {
  const router = useRouter()
  const params = useSearchParams()

  const [code, setCode] = useState(() => normaliseCode(params.get('code') ?? ''))
  const returnedError = params.get('e')

  // Cleared as soon as the player edits, so a stale failure never sits under a
  // code they have already changed.
  const [dismissedError, setDismissedError] = useState(false)
  const problem =
    returnedError && !dismissedError ? resolveRoomsError(new ApiError(returnedError, '')) : null

  const ready = isCompleteCode(code)

  const submit = () => {
    if (!ready) return
    setPendingSeat({ kind: 'join', code: normaliseCode(code) })
    router.push('/name')
  }

  return (
    <Screen>
      <ScreenTop>
        <IconButton
          icon={BackIcon}
          label="Back"
          onClick={() => router.push('/')}
          className="-ml-2"
        />
      </ScreenTop>

      <ScreenTitle>Enter the room code</ScreenTitle>
      <ScreenLead>
        Ask whoever made the room. It's {CODE_LENGTH} characters, and case doesn't matter.
      </ScreenLead>

      {/*
       * `CodeBoxes` filters a paste through the code alphabet, which turns a
       * pasted share URL into the first four usable characters of "https" — a
       * well-formed code for the wrong room. Capturing the paste first lets a
       * whole link resolve to the code it contains; anything else falls through
       * to the component's own handling untouched.
       */}
      <div
        onPasteCapture={(event) => {
          const pasted = event.clipboardData.getData('text')
          if (!pasted.includes('/r/')) return
          const found = codeFromShareInput(pasted)
          if (!found) return
          event.preventDefault()
          event.stopPropagation()
          setCode(found)
          setDismissedError(true)
        }}
      >
        <CodeBoxes
          label="Room code"
          value={code}
          onValueChange={(next) => {
            setCode(next)
            setDismissedError(true)
          }}
          invalid={problem !== null}
          autoFocus
        />
      </div>

      <Help
        tone={problem ? 'error' : 'default'}
        className="mt-3 min-h-[18px] text-center"
        role={problem ? 'alert' : undefined}
      >
        {problem?.message ?? ''}
      </Help>

      <ScreenFooter>
        <Button variant="primary" disabled={!ready} onClick={submit}>
          Join room
        </Button>
      </ScreenFooter>
    </Screen>
  )
}
