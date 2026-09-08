import type { LeaderboardRow, MarkRow, Mode, StatAttempt } from '@wordroom/shared'

/**
 * Which board is on screen. `week` reads `leaderboard_week`, which resets Monday
 * 00:00 in the room's timezone — the view owns that window, the client never
 * recomputes it.
 */
export type BoardRange = 'week' | 'all'

/** The two tabs inside the leaderboard sheet. */
export type BoardTab = 'board' | 'stats'

/**
 * How far a player has got on the puzzle currently on screen.
 *
 * `playing` is an attempt with guesses but no `finished_at`; `waiting` is a
 * player who has not opened this puzzle number yet.
 */
export type PuzzleStatus = 'solved' | 'failed' | 'playing' | 'waiting'

/**
 * One player's spoiler-free progress on a single puzzle.
 *
 * `grid` is decoded `attempts.marks`. Colours only — there is deliberately no
 * field here that could carry a guessed word, because a solved attempt's last
 * guess is the answer.
 */
export interface PuzzleProgress {
  playerId: string
  grid: readonly MarkRow[]
  status: PuzzleStatus
}

/** A board row plus the colour grid shown beside it. */
export interface BoardEntry {
  row: LeaderboardRow
  progress: PuzzleProgress
  /** True for the viewer's own row: `.lb li.me`. */
  me: boolean
}

export interface BoardQuery {
  roomId: string
  mode: Mode
  range: BoardRange
}

export interface PuzzleQuery {
  roomId: string
  mode: Mode
  /** The room's puzzle counter for this mode, as shown in the header. */
  number: number
}

export interface StatsQuery {
  roomId: string
  playerId: string
  mode: Mode
}

/**
 * Everything the leaderboard reads, behind one port.
 *
 * The Supabase implementation is `createLeaderboardSource` in
 * `supabase-source.ts`. Keeping the feature against an interface means the row
 * rendering, the FLIP reorder and the rank delta are all testable without a
 * network, and it is the seam workstream 3's client plugs into.
 */
export interface LeaderboardSource {
  fetchBoard(query: BoardQuery): Promise<LeaderboardRow[]>
  /** Colour grids for one puzzle number, keyed by player. */
  fetchPuzzleProgress(query: PuzzleQuery): Promise<PuzzleProgress[]>
  /** Every finished attempt of one player in one mode, shaped for `computeStats`. */
  fetchStatAttempts(query: StatsQuery): Promise<StatAttempt[]>
  /**
   * Fire `onChange` whenever an attempt in this room is written. The callback
   * gets no payload on purpose: see `answer-free.ts`.
   */
  subscribeToAttempts(roomId: string, onChange: () => void): () => void
}
