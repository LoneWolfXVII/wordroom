'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import {
  Button,
  Card,
  CardLabel,
  CodeDisplay,
  Icon,
  IconButton,
  Screen,
  ScreenFooter,
  ScreenLead,
  ScreenTitle,
  ScreenTop,
  ScreenTopSpacer,
  toast,
} from '@/components/ui'
import { CloseIcon, CopyIcon, ShareIcon, StartPlayingIcon } from '@/components/ui/icons'
import { MemberList } from './member-list'
import { GAME_PATH } from './routes'
import { copyText, shareRoom } from './share'
import { useActiveSeat, useMembers } from './use-rooms'

/**
 * The lobby: the code, how to pass it on, and who has arrived so far.
 *
 * The member list is live — `players` is in the realtime publication — so the
 * host watches friends appear here without refreshing, which is the whole reason
 * to sit on this screen rather than start playing immediately.
 */
export function LobbyScreen() {
  const router = useRouter()
  const { seat, isLoading, hasAnySeat } = useActiveSeat()
  const members = useMembers(seat?.room.id ?? null, seat?.player.id ?? null)

  // A direct visit with no seat — a shared URL, or cleared storage. Nothing to
  // show, so start them at the beginning rather than on an empty room.
  useEffect(() => {
    if (!isLoading && !hasAnySeat) router.replace('/')
  }, [isLoading, hasAnySeat, router])

  if (!seat) {
    return (
      <Screen>
        <div className="m-auto text-[15px] text-muted">Loading your room…</div>
      </Screen>
    )
  }

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
    <Screen>
      <ScreenTop>
        <ScreenTopSpacer />
        <IconButton
          icon={CloseIcon}
          label="Close"
          onClick={() => router.push(GAME_PATH)}
          className="-mr-2"
        />
      </ScreenTop>

      <ScreenTitle>{room.name}</ScreenTitle>
      <ScreenLead>Share the code. Anyone with it can join and start playing right away.</ScreenLead>

      <Card>
        <CardLabel>Room code</CardLabel>
        <CodeDisplay code={room.code} />
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <Button onClick={copyCode}>
            <Icon icon={CopyIcon} size={18} />
            Copy code
          </Button>
          <Button onClick={share}>
            <Icon icon={ShareIcon} size={18} />
            Share link
          </Button>
        </div>
      </Card>

      {/* The list can reach 8 rows; on a short phone it scrolls, the footer does not. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <MemberList members={list} room={room} meId={player.id} />
      </div>

      <ScreenFooter>
        <Button variant="primary" onClick={() => router.push(GAME_PATH)}>
          <Icon icon={StartPlayingIcon} size={18} />
          Start playing
        </Button>
      </ScreenFooter>
    </Screen>
  )
}
