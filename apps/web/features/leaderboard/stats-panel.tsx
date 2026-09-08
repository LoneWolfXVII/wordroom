'use client'

import type { PlayerStats } from '@wordroom/shared'
import { StatGrid, StatTile } from '@/components/ui'
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
    return (
      <p className="py-6 text-center text-[13px] text-muted leading-[1.4]">
        {error ?? (loading ? 'Loading your stats…' : 'No stats yet.')}
      </p>
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
