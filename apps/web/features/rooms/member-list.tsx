'use client'

import type { Player, Room } from '@wordroom/shared'
import { motion, useReducedMotion } from 'motion/react'
import { Avatar } from '@/components/ui'
import { cn } from '@/lib/cn'
import { isFinished, type MemberPuzzleStatus, statusLabel } from './puzzle-status'

/**
 * `.members` — who is in the room, and where they have got to.
 *
 * The right-hand column carries two different things and they do not replace
 * each other. Who you are and who hosts is fixed for as long as the room lasts;
 * whether someone has finished the puzzle on screen changes every few minutes.
 * A row reads "You · host · solved", or just "Priya  playing", or a bare name
 * for someone who has not started yet.
 *
 * The status half comes from `attempts` via `puzzle-status.ts`, through
 * workstream 4's allowlist. Nothing in this component has ever seen a guess.
 */

export interface MemberListProps {
  members: Player[]
  room: Room
  /** The viewer's own player id, so their row gets the accent avatar. */
  meId: string | null
  /**
   * Where each player has got to on the puzzle on screen. Absent, or a player
   * with no entry, reads as `waiting` and shows no caption — which is what the
   * lobby wants, since there is no puzzle on screen there.
   */
  statuses?: Record<string, MemberPuzzleStatus>
  className?: string
}

export function MemberList({ members, room, meId, statuses, className }: MemberListProps) {
  const reduced = useReducedMotion()

  return (
    <ul className={cn('mt-4 list-none p-0', className)}>
      {members.map((player) => {
        const isMe = player.id === meId
        const isHost = player.id === room.hostPlayerId
        // A departed host leaves `host_player_id` null, so nobody matches and no
        // row claims to be the host. Exactly the right answer: there isn't one.
        const role = isMe ? (isHost ? 'You · host' : 'You') : isHost ? 'Host' : null

        const status = statuses?.[player.id] ?? 'waiting'
        const caption = statusLabel(status)

        return (
          <motion.li
            key={player.id}
            // A player arriving is the lobby's one unprompted moment, and the
            // whole point of sitting on that screen. `layout` keeps the rows
            // that were already there from jumping as it lands — and does the
            // same for the gap a leaver closes.
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

            {role === null && caption === null ? null : (
              <span className="ml-auto flex flex-none items-center gap-1.5 text-[13px] text-muted">
                {role === null ? null : <span>{role}</span>}
                {role === null || caption === null ? null : <span aria-hidden="true">·</span>}
                {caption === null ? null : (
                  // A finished puzzle is the one thing on this row worth
                  // looking for, so it is the only thing that steps out of muted.
                  <span className={cn(isFinished(status) && 'font-medium text-ink-2')}>
                    {caption}
                  </span>
                )}
              </span>
            )}
          </motion.li>
        )
      })}
    </ul>
  )
}
