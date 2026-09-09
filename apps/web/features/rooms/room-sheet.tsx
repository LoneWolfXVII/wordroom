'use client'

import { useQueryClient } from '@tanstack/react-query'
import type { Room } from '@wordroom/shared'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button, Help, Icon, Sheet, toast } from '@/components/ui'
import { ForwardIcon, ShareIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import { leaveRoom } from './api'
import { resolveRoomsError } from './errors'
import { MemberList } from './member-list'
import { copyText, shareRoom } from './share'
import { setActiveRoomId } from './storage'
import { useActiveSeat, useMembers, usePuzzleStatuses } from './use-rooms'

/**
 * `#roomSheet` — the room's details, opened from the game header.
 *
 * **Workstream 2:** the header control is `<RoomButton>` below, and this is what
 * it opens. Hold the open state in the game screen and pass it down. Two
 * optional props come from the game because only it knows them: `puzzleId`, so
 * the member list can say who has finished the puzzle on screen, and `onLeft`,
 * which fires once a leave has gone through.
 *
 * Leaving is here, and it is a **hard leave**: the seat is deleted, the scores
 * in this room go with it, and the name is freed. `leave-room` does the work;
 * the confirmation below is what makes it a decision rather than a mis-tap.
 */
export function RoomSheet({
  open,
  onOpenChange,
  puzzleId = null,
  onLeft,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The puzzle on screen, for the member list's status column. */
  puzzleId?: string | null
  /**
   * Called after the seat has been deleted, before the redirect. The game store
   * is module scoped and outlives this route, so whoever owns it should clear
   * it here — otherwise the next room opens on the last room's puzzle.
   */
  onLeft?: () => void
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { seat } = useActiveSeat()
  const members = useMembers(seat?.room.id ?? null, seat?.player.id ?? null)
  const statuses = usePuzzleStatuses(puzzleId)

  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  if (!seat) return null

  const { room, player } = seat
  const list = members.data ?? []

  const copyCode = async () => {
    toast((await copyText(room.code)) ? 'Code copied' : 'Could not copy')
  }

  const share = async () => {
    const outcome = await shareRoom(room.code, room.name)
    if (outcome === 'copied') toast('Link copied')
    else if (outcome === 'failed') toast('Could not share')
  }

  /**
   * The seat is gone, whether we deleted it just now or someone else already had.
   *
   * The order is load-bearing. Dropping the seats query has to come *before*
   * `onLeft`, because `onLeft` clears the game store — and a null puzzle with a
   * still-cached seat is exactly the state in which the game route fetches the
   * next puzzle. That request would go out for a room this account was just
   * removed from and come back 403.
   */
  const afterLeaving = async () => {
    setActiveRoomId(null)
    setConfirming(false)
    router.replace('/')
    await queryClient.invalidateQueries({ queryKey: ['rooms'] })
    onLeft?.()
    toast('Left room')
  }

  const leave = async () => {
    setBusy(true)
    setFailure(null)

    try {
      await leaveRoom({ roomId: room.id })
      await afterLeaving()
    } catch (error) {
      const resolved = resolveRoomsError(error)

      // No seat to give up. A double tap, or a second device that already left —
      // the outcome the player asked for is the outcome they have.
      if (resolved.code === 'not_a_member') {
        await afterLeaving()
        return
      }

      setFailure(resolved.message)
      setBusy(false)
    }
  }

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        title={room.name}
        description={`${list.length} of ${room.maxPlayers} players`}
        action={
          <Button size="sm" onClick={copyCode} aria-label={`Copy room code ${room.code}`}>
            Code
            <b className="ml-1 font-semibold tracking-[0.1em] tabular">{room.code}</b>
          </Button>
        }
      >
        <MemberList members={list} room={room} meId={player.id} statuses={statuses.data ?? {}} />

        <div className="mt-[18px] grid grid-cols-2 gap-2.5">
          <Button onClick={share}>
            <Icon icon={ShareIcon} size={18} />
            Share link
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false)
              router.push('/lobby')
            }}
          >
            Room lobby
          </Button>
        </div>

        <Button
          variant="danger"
          className="mt-2.5"
          onClick={() => {
            // One sheet at a time: close this before the confirmation opens,
            // rather than stacking two focus traps and two scrims.
            onOpenChange(false)
            setFailure(null)
            setConfirming(true)
          }}
        >
          Leave room
        </Button>
      </Sheet>

      <LeaveConfirm
        open={confirming}
        onOpenChange={(next) => {
          if (!busy) setConfirming(next)
        }}
        roomName={room.name}
        playerName={player.name}
        busy={busy}
        failure={failure}
        onConfirm={leave}
      />
    </>
  )
}

/**
 * The confirmation for a leave.
 *
 * Same shape as the name-lock confirm on `/name`, for the same reason: what
 * happens next cannot be taken back, so it is spelled out first. The three lines
 * are the three things that actually change — scores, name, seat — named
 * plainly, because "are you sure?" tells a player nothing they did not know.
 */
function LeaveConfirm({
  open,
  onOpenChange,
  roomName,
  playerName,
  busy,
  failure,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  roomName: string
  playerName: string
  busy: boolean
  failure: string | null
  onConfirm: () => void
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Leave ${roomName}?`}
      description="This cannot be undone."
    >
      <ul className="m-0 list-none p-0 text-[15px] leading-[1.45] text-ink-2">
        <li className="border-t border-line py-2.5 first:border-t-0 first:pt-0">
          Your scores in this room are <b className="font-semibold text-ink">deleted</b>, including
          every puzzle you have already played here.
        </li>
        <li className="border-t border-line py-2.5">
          The name <b className="font-semibold text-ink">{playerName}</b> is freed, and anyone in
          this room can take it.
        </li>
        <li className="border-t border-line py-2.5">
          Your seat opens up. You can rejoin with the code, but you would start from nothing.
        </li>
      </ul>

      {failure === null ? null : (
        <Help tone="error" role="alert">
          {failure}
        </Help>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <Button onClick={() => onOpenChange(false)} disabled={busy}>
          Go back
        </Button>
        <Button variant="danger" loading={busy} onClick={onConfirm}>
          Leave room
        </Button>
      </div>
    </Sheet>
  )
}

/**
 * `.roombtn` — the room's name in the game header, which opens the room sheet.
 *
 * Exported for workstream 2's header. It truncates rather than wraps, because
 * the header is a three-column grid whose middle cell is the puzzle number and
 * must not move.
 */
export function RoomButton({
  room,
  onClick,
  className,
}: {
  room: Pick<Room, 'name'>
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-9 max-w-[150px] items-center gap-1.5 rounded-md pr-2.5 pl-3',
        'text-sm font-medium text-ink-2 transition-colors duration-micro active:bg-surface-2',
        className,
      )}
    >
      <span className="truncate">{room.name}</span>
      <Icon icon={ForwardIcon} size={16} />
    </button>
  )
}
