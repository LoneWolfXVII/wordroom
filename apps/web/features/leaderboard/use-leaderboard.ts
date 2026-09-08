'use client'

import type { Mode } from '@wordroom/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { rankMemoryKey, recordRank } from './rank-delta'
import type { BoardEntry, BoardRange, LeaderboardSource, PuzzleProgress } from './types'

/**
 * A burst of realtime events — one per guess as a rival works through a puzzle —
 * collapses into a single refetch. Well inside the spec's "within 2 seconds".
 */
const REFETCH_DEBOUNCE_MS = 120

export interface UseLeaderboardOptions {
  /** Null while workstream 3's Supabase client is still booting. */
  source: LeaderboardSource | null
  roomId: string
  mode: Mode
  range: BoardRange
  /** Puzzle number on screen, for the colour grids. Null hides them. */
  puzzleNumber: number | null
  /** The viewer, so their row can be marked and their rank remembered. */
  playerId: string
  /** Set false to stop fetching and drop the subscription. Default true. */
  enabled?: boolean
}

export interface UseLeaderboardResult {
  entries: BoardEntry[]
  loading: boolean
  error: string | null
  refresh: () => void
}

/** A board, tagged with which room / mode / range it is a board *of*. */
interface LoadedBoard {
  key: string
  entries: BoardEntry[]
  error: string | null
}

/** Stable empty array, so a caller's effects do not fire on every render. */
const EMPTY: BoardEntry[] = []

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Could not load the leaderboard'
}

/**
 * The board for one room, mode and range, kept live.
 *
 * Ranking, the weekly window and the points sum all come from
 * `leaderboard_week` / `leaderboard_all`; this hook never recomputes any of
 * them. A realtime event is treated as "something changed, ask again" rather
 * than as data to merge, which is both simpler and the reason no attempt field
 * beyond `marks` is ever needed on the client.
 */
export function useLeaderboard(options: UseLeaderboardOptions): UseLeaderboardResult {
  const { source, roomId, mode, range, puzzleNumber, playerId, enabled = true } = options

  /**
   * A different room, mode or range is a different list, not a reordering of
   * this one. Tagging the loaded state with the board it belongs to means a
   * board switch shows an empty list *during* the render that switches it,
   * rather than one frame of the old rows FLIPping into unrelated positions.
   */
  const boardKey = `${roomId}:${mode}:${range}`
  const [loaded, setLoaded] = useState<LoadedBoard | null>(null)
  const current = loaded !== null && loaded.key === boardKey ? loaded : null

  // Guards against an out-of-order response overwriting a newer one.
  const generation = useRef(0)

  const load = useCallback(async () => {
    if (source === null || !enabled) return
    const run = ++generation.current
    const key = `${roomId}:${mode}:${range}`

    try {
      const [rows, progress] = await Promise.all([
        source.fetchBoard({ roomId, mode, range }),
        puzzleNumber === null
          ? Promise.resolve<PuzzleProgress[]>([])
          : source.fetchPuzzleProgress({ roomId, mode, number: puzzleNumber }),
      ])
      if (run !== generation.current) return

      const byPlayer = new Map(progress.map((entry) => [entry.playerId, entry]))

      setLoaded({
        key,
        error: null,
        entries: rows.map((row) => {
          recordRank(rankMemoryKey(roomId, mode, range, row.playerId), row.rank)
          return {
            row,
            progress: byPlayer.get(row.playerId) ?? {
              playerId: row.playerId,
              grid: [],
              status: 'waiting',
            },
            me: row.playerId === playerId,
          }
        }),
      })
    } catch (cause) {
      if (run !== generation.current) return
      // Keep the last good board on screen; a dropped refresh is not a reason
      // to blank a leaderboard someone is reading.
      setLoaded((previous) => ({
        key,
        entries: previous !== null && previous.key === key ? previous.entries : [],
        error: message(cause),
      }))
    }
  }, [source, enabled, roomId, mode, range, puzzleNumber, playerId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (source === null || !enabled) return

    let timer: ReturnType<typeof setTimeout> | null = null
    const unsubscribe = source.subscribeToAttempts(roomId, () => {
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        void load()
      }, REFETCH_DEBOUNCE_MS)
    })

    return () => {
      if (timer !== null) clearTimeout(timer)
      unsubscribe()
    }
  }, [source, enabled, roomId, load])

  const refresh = useCallback(() => {
    void load()
  }, [load])

  return {
    entries: current?.entries ?? EMPTY,
    loading: current === null,
    error: current?.error ?? null,
    refresh,
  }
}
