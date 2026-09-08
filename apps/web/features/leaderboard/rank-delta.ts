import type { Mode } from '@wordroom/shared'
import { ordinal } from './format'
import type { BoardRange } from './types'

/**
 * Rank movement across one puzzle — the "↑ 2nd" tile on the result sheet.
 *
 * PUBLIC INTERFACE FOR WORKSTREAM 2. The result sheet should not talk to the
 * board or to Supabase; it calls `useRankDelta` (in `use-rank-delta.ts`), which
 * is a thin wrapper over the pure `rankDelta` below. See the module comment in
 * `use-rank-delta.ts` for the call shape.
 */

export type RankDirection = 'up' | 'down' | 'same' | 'new'

export interface RankDelta {
  /** Rank before the puzzle, or null if the player was not on the board yet. */
  before: number | null
  /** Rank now. */
  after: number
  /**
   * Places gained. Positive is an improvement, because rank 4 -> 2 is a climb
   * of two. Zero when the rank held or the player is new to the board.
   */
  moved: number
  direction: RankDirection
  /** Improved, so a `StatTile` should render the value in --correct. */
  improved: boolean
  /** Ready to drop into a `StatTile` value: `"↑ 2nd"`, `"3rd"`. */
  label: string
}

const ARROW: Record<RankDirection, string> = {
  up: '↑ ',
  down: '↓ ',
  same: '',
  new: '',
}

/**
 * Compare two ranks.
 *
 * A rank is 1-based and `leaderboard_*` emits `rank()`, so ties share a number
 * and the sequence can skip — 1, 1, 3. That is fine here: the delta is a
 * difference between two of those numbers, not a position in a list.
 */
export function rankDelta(before: number | null, after: number): RankDelta {
  const known = before !== null && Number.isFinite(before) && before > 0
  const direction: RankDirection = !known
    ? 'new'
    : after < (before as number)
      ? 'up'
      : after > (before as number)
        ? 'down'
        : 'same'

  const moved = known ? (before as number) - after : 0

  return {
    before: known ? before : null,
    after,
    moved,
    direction,
    improved: direction === 'up',
    label: `${ARROW[direction]}${ordinal(after)}`,
  }
}

/**
 * The last two *distinct* ranks seen for each player.
 *
 * Module-level rather than React state because the two readings happen in
 * different components at different times: the leaderboard sheet records a rank
 * whenever it loads or a realtime event lands, and the result sheet reads it
 * back after a solve. Storing the previous value alongside the current one
 * means neither has to run first — whoever records the post-solve rank pushes
 * the pre-solve one into `previous`, so the delta survives the race.
 *
 * A repeat of the same rank is not a move and does not shift `previous`, so a
 * board that refetches five times while nothing changes still reports 'same'.
 *
 * It is a cache of something the server already knows, so losing it on reload
 * costs a `direction: 'new'` and nothing else.
 */
interface RankHistory {
  current: number
  previous: number | null
}

const ranks = new Map<string, RankHistory>()

export function rankMemoryKey(
  roomId: string,
  mode: Mode,
  range: BoardRange,
  playerId: string,
): string {
  return `${roomId}:${mode}:${range}:${playerId}`
}

export function recordRank(key: string, rank: number): void {
  const seen = ranks.get(key)
  if (seen === undefined) {
    ranks.set(key, { current: rank, previous: null })
    return
  }
  if (seen.current === rank) return
  ranks.set(key, { current: rank, previous: seen.current })
}

/** The most recent rank recorded, or null if this player has never been seen. */
export function readRank(key: string): number | null {
  return ranks.get(key)?.current ?? null
}

/** The rank held before the latest move, or null if there has not been one. */
export function readPreviousRank(key: string): number | null {
  return ranks.get(key)?.previous ?? null
}

/** Test seam, and a hook for signing out. */
export function clearRankMemory(): void {
  ranks.clear()
}
