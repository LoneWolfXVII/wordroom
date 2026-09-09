'use client'

import { useQueryClient } from '@tanstack/react-query'
import type { Player } from '@wordroom/shared'
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
  Sheet,
} from '@/components/ui'
import { BackIcon, ForwardIcon, LockIcon } from '@/components/ui/icons'
import { createRoom, joinRoom } from './api'
import { resolveRoomsError } from './errors'
import { checkPlayerName, PLAYER_NAME_MAX, playerNameProblemMessage } from './names'
import { useSession } from './session'
import { getPendingSeat, type PendingSeat, setActiveRoom, setPendingSeat } from './storage'
import { roomKeys } from './use-rooms'

const NAME_FIELD_ID = 'playerName'

/**
 * The design system's `Input` takes no ref — it is typed `ComponentPropsWithoutRef`
 * — so the field is reached by id. Focusing after mount rather than with the
 * `autofocus` attribute is what `CodeBoxes` does too: the attribute is
 * server-rendered and takes focus before hydration.
 *
 * At module scope because it closes over nothing, which keeps it out of the
 * effect's dependency list.
 */
function focusName(): void {
  const field = document.getElementById(NAME_FIELD_ID)
  if (field instanceof HTMLInputElement) field.focus()
}

/**
 * "Pick your name" — and the confirmation that locks it.
 *
 * This screen is where the room actually comes into existence, because both
 * `create-room` and `join-room` take the player's name in the same call that
 * takes the room. So the seat and the locked name are created together or not at
 * all; there is no state where a player holds a seat with no name.
 *
 * **There is no rename path.** Not here, not in the lobby, not in the room
 * sheet, and not in the API — `players_name_locked` is a database trigger. The
 * confirmation step exists because that is irreversible and the player deserves
 * to be told so before it happens.
 *
 * Availability is not pre-checked against the server, and cannot be: a
 * prospective joiner has no select privilege on the `players` of a room they are
 * not in yet, and any check that did run would be a race against the unique
 * index that decides it. `name_taken` therefore comes back from the lock itself,
 * and lands on this field.
 */
export function NameScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { status: sessionStatus, error: sessionError, userId } = useSession()

  const [pending, setPending] = useState<PendingSeat | null | undefined>(undefined)
  const [value, setValue] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [taken, setTaken] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  // sessionStorage is not readable during render on the server, so the intent is
  // picked up after mount. `undefined` means "not looked yet", null means "there
  // is nothing here" — which is what a direct visit to /name looks like.
  useEffect(() => {
    const seat = getPendingSeat()
    setPending(seat)
    if (!seat) router.replace('/')
    else focusName()
  }, [router])

  const { value: playerName, problem } = checkPlayerName(value)
  const isTaken = taken !== null && taken.toLowerCase() === playerName.toLowerCase()
  const canContinue = problem === null && !isTaken && sessionStatus === 'ready'

  const back = () => {
    router.push(pending?.kind === 'create' ? '/create' : '/join')
  }

  const lock = async () => {
    if (!pending || problem !== null) return
    setBusy(true)
    setFailure(null)

    try {
      const seat =
        pending.kind === 'create'
          ? await createRoom({ roomName: pending.roomName, playerName })
          : await joinRoom({ code: pending.code, playerName })

      setActiveRoom({ id: seat.room.id, name: seat.room.name })
      setPendingSeat(null)

      // Seed the cache with what the server just told us, so the lobby has the
      // seat the moment it mounts rather than after a round trip. The
      // invalidate below still runs, to pick up anyone who joined meanwhile.
      if (userId) {
        queryClient.setQueryData(roomKeys.seats(userId), (rows: Player[] | undefined) => [
          ...(rows ?? []).filter((row) => row.id !== seat.player.id),
          seat.player,
        ])
      }
      queryClient.setQueryData(roomKeys.room(seat.room.id), seat.room)

      await queryClient.invalidateQueries({ queryKey: ['rooms'] })
      setConfirming(false)
      router.replace('/lobby')
      return
    } catch (error) {
      const resolved = resolveRoomsError(error)
      setConfirming(false)

      // Already seated under a different, locked name. Nothing to fix — the
      // only useful thing to do is open the room they are already in.
      if (resolved.alreadySeated) {
        setPendingSeat(null)
        await queryClient.invalidateQueries({ queryKey: ['rooms'] })
        router.replace('/lobby')
        return
      }

      if (resolved.field === 'playerName') {
        setTaken(playerName)
        setBusy(false)
        requestAnimationFrame(focusName)
        return
      }

      // The code is the problem, not the name. Send them back to the code with
      // it still typed in, rather than making them find their way there.
      if (resolved.field === 'code' && pending.kind === 'join') {
        setPendingSeat(null)
        router.replace(`/join?code=${encodeURIComponent(pending.code)}&e=${resolved.code}`)
        return
      }

      setFailure(resolved.message)
      setBusy(false)
    }
  }

  const roomLabel =
    pending?.kind === 'create' ? (
      <b className="font-semibold">{pending.roomName}</b>
    ) : pending?.kind === 'join' ? (
      <b className="font-semibold tracking-[0.1em] tabular">{pending.code}</b>
    ) : (
      'this room'
    )

  // The name cannot be checked against the room's other players, so "available"
  // is only ever claimed where it is certainly true: a room with no one else in
  // it yet.
  const help = (() => {
    if (failure) return { tone: 'error' as const, text: failure }
    if (sessionStatus === 'error') {
      return {
        tone: 'error' as const,
        text: sessionError?.message ?? 'Could not start a session. Reload and try again.',
      }
    }
    if (isTaken)
      return { tone: 'error' as const, text: 'Someone in this room already has that name.' }
    if (value.trim() !== '' && problem !== null) {
      return { tone: 'default' as const, text: playerNameProblemMessage(problem) }
    }
    if (problem === null && pending?.kind === 'create') {
      return { tone: 'ok' as const, text: 'Available. Names are locked once confirmed.' }
    }
    return {
      tone: 'default' as const,
      text: 'Names are locked once confirmed. No changes, no renames.',
    }
  })()

  return (
    <Screen>
      <ScreenTop>
        <IconButton icon={BackIcon} label="Back" onClick={back} className="-ml-2" />
      </ScreenTop>

      <ScreenTitle>Pick your name</ScreenTitle>
      <ScreenLead>This is how you'll appear on the leaderboard in {roomLabel}.</ScreenLead>

      <Field>
        <Label htmlFor={NAME_FIELD_ID}>Your name</Label>
        <Input
          id={NAME_FIELD_ID}
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            setFailure(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && canContinue) setConfirming(true)
          }}
          placeholder="Nischal"
          maxLength={PLAYER_NAME_MAX}
          autoComplete="off"
          aria-invalid={isTaken || undefined}
        />
        <Help tone={help.tone} role={help.tone === 'error' ? 'alert' : undefined}>
          {help.text}
        </Help>
      </Field>

      <ScreenFooter>
        <Button variant="primary" disabled={!canContinue} onClick={() => setConfirming(true)}>
          <Icon icon={ForwardIcon} size={18} />
          Continue
        </Button>
      </ScreenFooter>

      <Sheet
        open={confirming}
        onOpenChange={(open) => {
          if (!busy) setConfirming(open)
        }}
        title={`Lock in ${playerName}?`}
        description="You won't be able to change it later, even by leaving and rejoining."
      >
        <div className="mt-2 grid grid-cols-2 gap-2.5">
          <Button onClick={() => setConfirming(false)} disabled={busy}>
            Go back
          </Button>
          {/* The one irreversible tap in onboarding, so it says so twice: the
              sheet explains, and the padlock is the same glyph the locked name
              carries afterwards. "Go back" stays plain — an icon on the way out
              of a confirmation is noise. */}
          <Button variant="primary" loading={busy} onClick={lock}>
            <Icon icon={LockIcon} size={18} />
            Lock it
          </Button>
        </div>
      </Sheet>
    </Screen>
  )
}
