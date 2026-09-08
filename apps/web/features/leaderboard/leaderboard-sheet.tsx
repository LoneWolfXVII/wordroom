'use client'

import type { Mode } from '@wordroom/shared'
import { useState } from 'react'
import { SegmentedControl, Sheet } from '@/components/ui'
import { LeaderboardList } from './leaderboard-list'
import { StatsPanel } from './stats-panel'
import type { BoardRange, BoardTab, LeaderboardSource } from './types'
import { useLeaderboard } from './use-leaderboard'
import { useStats } from './use-stats'

const TABS = [
  { value: 'board', label: 'Board' },
  { value: 'stats', label: 'Your stats' },
] as const satisfies readonly { value: BoardTab; label: string }[]

const RANGES = [
  { value: 'week', label: 'This week' },
  { value: 'all', label: 'All time' },
] as const satisfies readonly { value: BoardRange; label: string }[]

export interface LeaderboardSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Null while workstream 3's Supabase client is still booting. */
  source: LeaderboardSource | null
  roomId: string
  /** The viewer's `players.id`. */
  playerId: string
  /** The mode being played. Switching it in the game header switches the board. */
  mode: Mode
  /** Puzzle number on screen, for each row's colour grid. */
  puzzleNumber: number | null
  /** Guess count of the puzzle just solved, so its distribution bar highlights. */
  highlightGuesses?: number | null
  /** The result sheet links straight to the stats tab. Defaults to the board. */
  initialTab?: BoardTab
}

/**
 * `#lbSheet` — the board, plus the "Your stats" tab the build plan adds to it.
 *
 * Nothing rendered here can spoil a puzzle: rows carry `attempts.marks` and
 * scores, and the words behind those colours are never fetched.
 */
export function LeaderboardSheet({
  open,
  onOpenChange,
  source,
  roomId,
  playerId,
  mode,
  puzzleNumber,
  highlightGuesses = null,
  initialTab = 'board',
}: LeaderboardSheetProps) {
  const [tab, setTab] = useState<BoardTab>(initialTab)
  const [range, setRange] = useState<BoardRange>('week')

  const board = useLeaderboard({
    source,
    roomId,
    mode,
    range,
    puzzleNumber,
    playerId,
    enabled: open,
  })

  const stats = useStats({
    source,
    roomId,
    playerId,
    mode,
    enabled: open && tab === 'stats',
  })

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Leaderboard"
      description={`${mode} letters`}
      action={
        tab === 'board' ? (
          <SegmentedControl
            options={RANGES}
            value={range}
            onValueChange={setRange}
            label="Leaderboard range"
            className="w-[180px] flex-none"
          />
        ) : null
      }
    >
      <SegmentedControl
        options={TABS}
        value={tab}
        onValueChange={setTab}
        label="Leaderboard view"
        className="mb-3.5 w-full"
      />

      {tab === 'board' ? (
        <>
          <LeaderboardList entries={board.entries} loading={board.loading} />
          <p className="mt-3.5 text-[13px] text-muted leading-[1.4]">
            Points: 6 for a first-guess solve, down to 1 for a sixth. Time only breaks ties. Resets
            Monday.
          </p>
          {board.error === null ? null : (
            <p className="mt-2 text-[13px] text-danger leading-[1.4]">{board.error}</p>
          )}
        </>
      ) : (
        <StatsPanel
          stats={stats.stats}
          loading={stats.loading}
          error={stats.error}
          highlightGuesses={highlightGuesses}
        />
      )}
    </Sheet>
  )
}
