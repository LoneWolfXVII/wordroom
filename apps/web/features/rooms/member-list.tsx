'use client'

import type { Player, Room } from '@wordroom/shared'
import { motion, useReducedMotion } from 'motion/react'
import { Avatar } from '@/components/ui'
import { cn } from '@/lib/cn'

/**
 * `.members` — who is in the room.
 *
 * The prototype's right-hand column shows live play status ("solved",
 * "playing"). That comes from `attempts` for the current puzzle, which is the
 * leaderboard's realtime feed and not this feature's to read — see the note in
 * `index.ts` about the `status` slot workstream 4 can fill. Until then the
 * column carries what this feature does know: who you are, and who hosts.
 */

export interface MemberListProps {
  members: Player[]
  room: Room
  /** The viewer's own player id, so their row gets the accent avatar. */
  meId: string | null
  /** Optional per-player right-hand caption. Returning null falls back to host/you. */
  status?: (player: Player) => string | null
  className?: string
}

export function MemberList({ members, room, meId, status, className }: MemberListProps) {
  const reduced = useReducedMotion()

  return (
    <ul className={cn('mt-4 list-none p-0', className)}>
      {members.map((player) => {
        const isMe = player.id === meId
        const isHost = player.id === room.hostPlayerId
        const caption =
          status?.(player) ?? (isMe ? (isHost ? 'You · host' : 'You') : isHost ? 'Host' : '')

        return (
          <motion.li
            key={player.id}
            // A player arriving is the lobby's one unprompted moment, and the
            // whole point of sitting on that screen. `layout` keeps the rows
            // that were already there from jumping as it lands.
            layout={!reduced}
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
            className={cn(
              'flex items-center gap-3 border-t border-line py-[11px] text-[15px]',
              'first:border-t-0',
            )}
          >
            <Avatar name={player.name} me={isMe} />
            <span className="min-w-0 truncate">{player.name}</span>
            {caption ? <span className="ml-auto text-[13px] text-muted">{caption}</span> : null}
          </motion.li>
        )
      })}
    </ul>
  )
}
