'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  Button,
  Field,
  Help,
  Icon,
  IconButton,
  Input,
  Label,
  Screen,
  ScreenFooter,
  ScreenLead,
  ScreenTitle,
  ScreenTop,
} from '@/components/ui'
import { BackIcon, PlusIcon } from '@/components/ui/icons'
import { checkRoomName, ROOM_NAME_MAX } from './names'
import { setPendingSeat } from './storage'

/**
 * "Name your room".
 *
 * Nothing is created here. `create-room` wants the room's name and the host's
 * name in one call, so this screen only records the answer and hands over to the
 * name screen, which is where the single call is made. That ordering is the
 * prototype's, and it is also the only one that cannot leave a room standing
 * with no host in it.
 */
const ROOM_FIELD_ID = 'roomName'

export function CreateRoomScreen() {
  const router = useRouter()
  const [value, setValue] = useState('')
  const { value: roomName, problem } = checkRoomName(value)

  // After mount, not via the `autofocus` attribute — which is server-rendered
  // and takes focus before hydration.
  useEffect(() => {
    const field = document.getElementById(ROOM_FIELD_ID)
    if (field instanceof HTMLInputElement) field.focus()
  }, [])

  const submit = () => {
    if (problem) return
    setPendingSeat({ kind: 'create', roomName })
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

      <ScreenTitle>Name your room</ScreenTitle>
      <ScreenLead>
        Friends join with a four-character code. You'll get it on the next screen.
      </ScreenLead>

      <Field>
        <Label htmlFor={ROOM_FIELD_ID}>Room name</Label>
        <Input
          id={ROOM_FIELD_ID}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            // As on the name screen: cancel Enter's default activation before
            // moving anywhere, so the keypress cannot land on whatever is
            // focused after the move.
            event.preventDefault()
            submit()
          }}
          placeholder="Friday crew"
          maxLength={ROOM_NAME_MAX}
          autoComplete="off"
        />
        <Help>Shown at the top of everyone's game.</Help>
      </Field>

      <ScreenFooter>
        <Button variant="primary" disabled={problem !== null} onClick={submit}>
          <Icon icon={PlusIcon} size={18} />
          Create room
        </Button>
      </ScreenFooter>
    </Screen>
  )
}
