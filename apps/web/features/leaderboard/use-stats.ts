'use client'

import { computeStats, type Mode, type PlayerStats } from '@wordroom/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { LeaderboardSource } from './types'

export interface UseStatsOptions {
  source: LeaderboardSource | null
  roomId: string
  playerId: string
  mode: Mode
  /** Set false while the stats tab is hidden. Defaults to true. */
  enabled?: boolean
}

export interface UseStatsResult {
  stats: PlayerStats | null
  loading: boolean
  error: string | null
  refresh: () => void
}

/**
 * Played / win % / streaks / distribution for one player in one mode.
 *
 * The hook fetches finished attempts and hands them straight to `computeStats`
 * from `@wordroom/shared`. All the fiddly rules — a skipped puzzle number breaks
 * a streak, modes never interact, a fail counts as played but not won — live
 * there with tests, and are deliberately not restated here.
 */
export function useStats(options: UseStatsOptions): UseStatsResult {
  const { source, roomId, playerId, mode, enabled = true } = options

  const [stats, setStats] = useState<PlayerStats | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)

  // Guards against an out-of-order response overwriting a newer one.
  const generation = useRef(0)

  const load = useCallback(async () => {
    if (source === null || !enabled) return
    const run = ++generation.current
    setLoading(true)

    try {
      const attempts = await source.fetchStatAttempts({ roomId, playerId, mode })
      if (run !== generation.current) return
      setStats(computeStats(attempts, mode))
      setError(null)
    } catch (cause) {
      if (run !== generation.current) return
      setError(cause instanceof Error ? cause.message : 'Could not load your stats')
    } finally {
      if (run === generation.current) setLoading(false)
    }
  }, [source, enabled, roomId, playerId, mode])

  useEffect(() => {
    void load()
  }, [load])

  const refresh = useCallback(() => {
    void load()
  }, [load])

  return { stats, loading, error, refresh }
}
