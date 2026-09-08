'use client'

import type { Mode } from '@wordroom/shared'
import { useEffect, useState } from 'react'
import {
  type RankDelta,
  rankDelta,
  rankMemoryKey,
  readPreviousRank,
  readRank,
  recordRank,
} from './rank-delta'
import type { BoardRange, LeaderboardSource } from './types'

/**
 * Rank movement for the result sheet. THIS IS THE INTERFACE FOR WORKSTREAM 2.
 *
 * Mount it when the result sheet opens, after `submit-guess` has returned, and
 * render `delta.label` in a `StatTile` with `positive={delta.improved}` — that
 * is the prototype's "↑ 2nd / rank" tile, `.stat .v.up` and all.
 *
 *     const { delta, loading } = useRankDelta({
 *       source,                    // createLeaderboardSource(supabase)
 *       roomId,
 *       mode,                      // 5 | 6 | 7
 *       playerId,                  // the viewer's players.id
 *       range: 'week',             // optional, defaults to 'week'
 *       enabled: resultSheetOpen,  // optional, defaults to true
 *     })
 *
 *     <StatTile value={delta?.label ?? '—'} label="rank" positive={delta?.improved} />
 *
 * The comparison point is whatever rank was last recorded for this player, which
 * the leaderboard sheet writes on every load and every realtime refresh. Nothing
 * has to be captured before the puzzle starts: `recordRank` keeps the previous
 * distinct value, so the pre-solve rank is still there after the post-solve one
 * lands. If the player has never been on this board, `delta.direction` is
 * `'new'` and `label` is a bare ordinal with no arrow.
 *
 * `delta` is null while loading and if the player has no row at all yet (they
 * have finished nothing in this mode this week), so guard on it.
 */
export interface UseRankDeltaOptions {
  source: LeaderboardSource | null
  roomId: string
  mode: Mode
  playerId: string
  /** Which board the delta is measured on. Defaults to the weekly board. */
  range?: BoardRange
  /** Set false to skip the fetch. Defaults to true. */
  enabled?: boolean
}

export interface UseRankDeltaResult {
  delta: RankDelta | null
  loading: boolean
  error: string | null
}

export function useRankDelta(options: UseRankDeltaOptions): UseRankDeltaResult {
  const { source, roomId, mode, playerId, range = 'week', enabled = true } = options

  const [delta, setDelta] = useState<RankDelta | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (source === null || !enabled) {
      setLoading(false)
      return
    }

    let live = true
    setLoading(true)

    void (async () => {
      try {
        const rows = await source.fetchBoard({ roomId, mode, range })
        if (!live) return

        const key = rankMemoryKey(roomId, mode, range, playerId)
        const mine = rows.find((row) => row.playerId === playerId)

        if (mine === undefined) {
          setDelta(null)
        } else {
          recordRank(key, mine.rank)
          setDelta(rankDelta(readPreviousRank(key), readRank(key) ?? mine.rank))
        }
        setError(null)
      } catch (cause) {
        if (!live) return
        setError(cause instanceof Error ? cause.message : 'Could not read the leaderboard')
      } finally {
        if (live) setLoading(false)
      }
    })()

    return () => {
      live = false
    }
  }, [source, enabled, roomId, mode, range, playerId])

  return { delta, loading, error }
}
