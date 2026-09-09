'use client'

import { AnimatePresence } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { BoardSkeleton, TileArt } from '@/components/ui'
import { LeaderboardRow } from './leaderboard-row'
import type { BoardEntry } from './types'

/** How long a moved row keeps its wash. Matches the fade in `LeaderboardRow`. */
const HIGHLIGHT_MS = 600

export interface LeaderboardListProps {
  entries: BoardEntry[]
  loading: boolean
}

/**
 * `.lb` — the ordered list, with rows that FLIP to their new position.
 *
 * Motion's `layout` prop does the measuring: when a rival's solve reorders the
 * board, each row animates from where it was to where it now is over --d-struct
 * rather than jumping. `useReducedMotion` in the row collapses that to an
 * instant move.
 */
export function LeaderboardList({ entries, loading }: LeaderboardListProps) {
  // Rank per player as of the previous render, to spot what moved.
  const seen = useRef(new Map<string, number>())
  const [moved, setMoved] = useState<ReadonlySet<string>>(() => new Set())

  useEffect(() => {
    const next = new Set<string>()
    for (const entry of entries) {
      const before = seen.current.get(entry.row.playerId)
      if (before !== undefined && before !== entry.row.rank) next.add(entry.row.playerId)
      seen.current.set(entry.row.playerId, entry.row.rank)
    }

    if (next.size === 0) return
    setMoved(next)
    const timer = setTimeout(() => setMoved(new Set()), HIGHLIGHT_MS)
    return () => clearTimeout(timer)
  }, [entries])

  if (entries.length === 0) {
    // Loading and empty are different states and used to render the same
    // sentence. A skeleton says "rows are coming" without claiming there are
    // none; the mark says there are none, and why that is not a problem.
    if (loading) return <BoardSkeleton />

    return (
      <div className="py-4 text-center">
        <TileArt variant="absent" className="mx-auto mb-4 h-[76px] w-[150px]" />
        <p className="text-[14px] leading-[1.45] font-medium text-ink">No scores yet.</p>
        <p className="mx-auto mt-1 max-w-[28ch] text-[13px] leading-[1.4] text-muted">
          Finish a puzzle and you will be the first on the board.
        </p>
      </div>
    )
  }

  return (
    <ol className="m-0 list-none p-0">
      <AnimatePresence initial={false}>
        {entries.map((entry) => (
          <LeaderboardRow
            key={entry.row.playerId}
            entry={entry}
            moved={moved.has(entry.row.playerId)}
          />
        ))}
      </AnimatePresence>
    </ol>
  )
}
