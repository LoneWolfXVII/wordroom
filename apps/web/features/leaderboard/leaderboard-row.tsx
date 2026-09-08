'use client'

import { motion, useReducedMotion } from 'motion/react'
import { Badge, MiniGrid } from '@/components/ui'
import { cn } from '@/lib/cn'
import { formatAverage } from './format'
import type { BoardEntry, PuzzleStatus } from './types'

/** `--d-struct`, `--e-out`. Motion takes seconds and a bezier array. */
const STRUCT_SECONDS = 0.35
const EASE_OUT = [0.2, 0.8, 0.2, 1] as const

/**
 * The prototype fades a moved row from --accent-soft over 2s. The motion budget
 * caps every animation at --d-reveal, so the fade runs at 600ms instead.
 */
const HIGHLIGHT_SECONDS = 0.6

const STATUS_LABEL: Record<PuzzleStatus, string> = {
  solved: 'solved',
  failed: 'failed',
  playing: 'playing',
  waiting: '',
}

export interface LeaderboardRowProps {
  entry: BoardEntry
  /** The row's rank changed on the last update, so it gets the highlight wash. */
  moved: boolean
}

/**
 * `.lb li` — rank, name, hard-mode badge, this puzzle's colours, score, average.
 *
 * The grid carries no letters and never can: it renders `attempts.marks`, which
 * is the only projection of an attempt the room is granted. Showing a rival's
 * guessed words would hand them the answer.
 */
export function LeaderboardRow({ entry, moved }: LeaderboardRowProps) {
  const reduced = useReducedMotion()
  const { row, progress, me } = entry
  const status = STATUS_LABEL[progress.status]

  return (
    <motion.li
      layout
      transition={{ duration: reduced ? 0 : STRUCT_SECONDS, ease: EASE_OUT }}
      className={cn(
        'relative isolate grid items-center gap-3 border-line border-t py-3 text-[15px] first:border-t-0',
        'grid-cols-[24px_1fr_auto_auto]',
      )}
    >
      {moved ? (
        <motion.span
          aria-hidden
          key={row.rank}
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : HIGHLIGHT_SECONDS, ease: 'easeOut' }}
          className="-z-10 absolute inset-x-[-8px] inset-y-0 rounded-sm bg-accent-soft"
        />
      ) : null}

      <span className="tabular text-[13px] text-muted">{row.rank}</span>

      <span className={cn('font-medium leading-[1.2]', me && 'text-accent')}>
        {row.playerName}
        {row.hardMode ? <Badge>HARD</Badge> : null}
        {status === '' ? null : (
          <small className="mt-[3px] block font-normal text-[12px] text-muted">{status}</small>
        )}
      </span>

      <MiniGrid
        rows={progress.grid}
        label={`Colour grid, ${progress.grid.length} of 6 guesses, no letters`}
      />

      <span className="tabular min-w-[34px] text-right font-semibold">
        {row.points}
        <span className="block font-normal text-[12px] text-muted">
          {formatAverage(row.averageGuesses, row.solved)}
        </span>
      </span>
    </motion.li>
  )
}
