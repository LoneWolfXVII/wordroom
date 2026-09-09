'use client'

import type { PlayerStats } from '@wordroom/shared'
import { StatGrid, StatsSkeleton, StatTile, TileArt } from '@/components/ui'
import { GuessDistribution } from './guess-distribution'

export interface StatsPanelProps {
  stats: PlayerStats | null
  loading: boolean
  error: string | null
  /** Guess count of the puzzle just solved, so its bar is drawn in --correct. */
  highlightGuesses?: number | null
}

/**
 * "Your stats" — the second tab of the leaderboard sheet.
 *
 * Everything on it is `computeStats()` output. Streaks are consecutive puzzle
 * numbers solved within one mode, and a skip breaks one exactly as a fail does;
 * that rule is implemented and tested once, in `@wordroom/shared`.
 */
export function StatsPanel({ stats, loading, error, highlightGuesses = null }: StatsPanelProps) {
  if (stats === null) {
    if (error) {
      return (
        <div className="py-4 text-center">
          <TileArt variant="lost" className="mx-auto mb-4 h-[76px] w-[150px]" />
          <p className="text-[14px] leading-[1.45] font-medium text-ink">{error}</p>
        </div>
      )
    }

    if (loading) return <StatsSkeleton />

    return (
      <div className="py-4 text-center">
        <TileArt variant="waiting" className="mx-auto mb-4 h-[76px] w-[150px]" />
        <p className="text-[14px] leading-[1.45] font-medium text-ink">Nothing to count yet.</p>
        <p className="mx-auto mt-1 max-w-[28ch] text-[13px] leading-[1.4] text-muted">
          Play a puzzle and your streak starts here.
        </p>
      </div>
    )
  }

  return (
    <div>
      <StatGrid columns={4}>
        <StatTile value={stats.played} label="played" />
        <StatTile value={`${stats.winPercent}%`} label="win" />
        <StatTile value={stats.currentStreak} label="streak" />
        <StatTile value={stats.maxStreak} label="max" />
      </StatGrid>

      <h3 className="mt-5 mb-2.5 font-semibold text-[14px]">Guess distribution</h3>
      <GuessDistribution stats={stats} highlightGuesses={highlightGuesses} />

      {error === null ? null : (
        <p className="mt-3 text-[13px] text-danger leading-[1.4]">{error}</p>
      )}
    </div>
  )
}
