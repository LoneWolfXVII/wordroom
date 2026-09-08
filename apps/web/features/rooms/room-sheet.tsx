'use client'

import type { Room } from '@wordroom/shared'
import { useRouter } from 'next/navigation'
import { Button, Icon, Sheet, toast } from '@/components/ui'
import { ForwardIcon, ShareIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import { MemberList } from './member-list'
import { copyText, shareRoom } from './share'
import { useActiveSeat, useMembers } from './use-rooms'

/**
 * `#roomSheet` — the room's details, opened from the game header.
 *
 * **Workstream 2:** the header control is `<RoomButton>` below, and this is what
 * it opens. Hold the open state in the game screen and pass it down; nothing
 * here needs a room prop, because the active seat is resolved from the session.
 *
 * The prototype's "Leave room" is deliberately absent. `authenticated` has no
 * delete grant on `players` and there is no `leave-room` function, so nothing
 * here could honestly do it — and the lock copy ("even by leaving and
 * rejoining") says a seat is meant to outlive a departure anyway. See the report.
 */
export function RoomSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const { seat } = useActiveSeat()
  const members = useMembers(seat?.room.id ?? null)

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

  return (
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
      <MemberList members={list} room={room} meId={player.id} />

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
