import type { SupabaseClient } from '@supabase/supabase-js'
import {
  decodeMarks,
  type LeaderboardRow,
  type MarkRow,
  type Mode,
  type StatAttempt,
} from '@wordroom/shared'
import { ATTEMPT_PUBLIC_SELECT, forbiddenColumns, narrowAttempt } from './answer-free'
import type {
  BoardQuery,
  LeaderboardSource,
  PuzzleProgress,
  PuzzleQuery,
  PuzzleStatus,
  StatsQuery,
} from './types'

/**
 * The Supabase implementation of `LeaderboardSource`.
 *
 * Everything here reads from the answer-free surfaces: `leaderboard_week` /
 * `leaderboard_all` for scores, `room_puzzles` for the puzzle id, and an
 * explicit column list on `attempts` for the colour grids. No query in this file
 * may ever grow a `*`, and none of them names the answer column on `puzzles`,
 * the seed column on `rooms`, or `attempts.guesses` — the grants in
 * `20260908000200_rls.sql` would refuse them, and the point is not to ask in the
 * first place.
 */

const BOARD_COLUMNS =
  'player_id, player_name, mode, rank, points, played, solved, average_guesses, total_elapsed_ms, hard_mode'

const BOARD_VIEW = {
  week: 'leaderboard_week',
  all: 'leaderboard_all',
} as const

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readNumber(value: unknown): number {
  if (typeof value === 'number') return value
  // PostgREST returns `numeric` as a string, which is what `average_guesses` is.
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function readNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const parsed = readNumber(value)
  return Number.isFinite(parsed) ? parsed : null
}

function readMode(value: unknown, fallback: Mode): Mode {
  const parsed = readNumber(value)
  return parsed === 5 || parsed === 6 || parsed === 7 ? parsed : fallback
}

/**
 * Decode `attempts.marks`, tolerating a row this codec did not write.
 *
 * `decodeMarkRow` throws on an unknown mark, and one bad row should grey out a
 * single grid rather than take down the whole leaderboard.
 */
function readGrid(value: unknown): MarkRow[] {
  if (!Array.isArray(value)) return []
  const encoded = value.filter((row): row is string => typeof row === 'string')
  try {
    return decodeMarks(encoded)
  } catch {
    return []
  }
}

function readStatus(record: Record<string, unknown>): PuzzleStatus {
  if (record.solved === true) return 'solved'
  if (record.finished_at !== null && record.finished_at !== undefined) return 'failed'
  return readNumber(record.guess_count) > 0 ? 'playing' : 'waiting'
}

export function createLeaderboardSource(client: SupabaseClient): LeaderboardSource {
  async function puzzleId(query: PuzzleQuery): Promise<string | null> {
    const { data, error } = await client
      .from('room_puzzles')
      .select('id')
      .eq('room_id', query.roomId)
      .eq('mode', query.mode)
      .eq('number', query.number)
      .maybeSingle()

    if (error) throw new Error(error.message)
    const id = readString(asRecord(data).id)
    return id === '' ? null : id
  }

  return {
    async fetchBoard(query: BoardQuery): Promise<LeaderboardRow[]> {
      const { data, error } = await client
        .from(BOARD_VIEW[query.range])
        .select(BOARD_COLUMNS)
        .eq('room_id', query.roomId)
        .eq('mode', query.mode)
        .order('rank', { ascending: true })

      if (error) throw new Error(error.message)

      const rows: unknown[] = Array.isArray(data) ? data : []
      return rows.map((row) => {
        const record = asRecord(row)
        return {
          playerId: readString(record.player_id),
          playerName: readString(record.player_name),
          mode: readMode(record.mode, query.mode),
          rank: readNumber(record.rank),
          points: readNumber(record.points),
          played: readNumber(record.played),
          solved: readNumber(record.solved),
          // Null until the player's first solve; `formatAverage` renders that.
          averageGuesses: readNumber(record.average_guesses),
          totalElapsedMs: readNullableNumber(record.total_elapsed_ms),
          hardMode: record.hard_mode === true,
        }
      })
    },

    async fetchPuzzleProgress(query: PuzzleQuery): Promise<PuzzleProgress[]> {
      const id = await puzzleId(query)
      if (id === null) return []

      const { data, error } = await client
        .from('attempts')
        .select(ATTEMPT_PUBLIC_SELECT)
        .eq('puzzle_id', id)

      if (error) throw new Error(error.message)

      const rows: unknown[] = Array.isArray(data) ? data : []
      return rows.map((row) => {
        // Narrowed even on a plain read, so one shape reaches the UI either way.
        const record = asRecord(narrowAttempt(row))
        return {
          playerId: readString(record.player_id),
          grid: readGrid(record.marks),
          status: readStatus(record),
        }
      })
    },

    async fetchStatAttempts(query: StatsQuery): Promise<StatAttempt[]> {
      // `mode` and `number` come from the embedded puzzle. `answer` is not in
      // the column grant, so the embed cannot name it and `select` never does.
      const { data, error } = await client
        .from('attempts')
        .select('solved, guess_count, finished_at, puzzles!inner(mode, number, room_id)')
        .eq('player_id', query.playerId)
        .eq('puzzles.room_id', query.roomId)
        .eq('puzzles.mode', query.mode)
        .not('finished_at', 'is', null)

      if (error) throw new Error(error.message)

      const rows: unknown[] = Array.isArray(data) ? data : []
      return rows.map((row) => {
        const record = asRecord(row)
        // PostgREST gives a to-one embed as an object; older versions wrap it.
        const embedded = Array.isArray(record.puzzles) ? record.puzzles[0] : record.puzzles
        const puzzle = asRecord(embedded)
        return {
          mode: readMode(puzzle.mode, query.mode),
          number: readNumber(puzzle.number),
          solved: record.solved === true,
          guessCount: readNumber(record.guess_count),
        }
      })
    },

    subscribeToAttempts(roomId: string, onChange: () => void): () => void {
      const channel = client
        .channel(`leaderboard:${roomId}`)
        .on<Record<string, unknown>>(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'attempts' },
          (payload) => {
            const record = payload.new ?? payload.old

            // The publication carries whatever columns `authenticated` may
            // select, and `guesses` is revoked — but say so out loud rather than
            // trusting it, and drop the payload either way.
            const leaked = forbiddenColumns(record)
            if (leaked.length > 0) {
              console.error(
                `Realtime payload for attempts carried columns the room may not see: ${leaked.join(', ')}. Dropped.`,
              )
            }

            // Only the allowlisted fields exist past this line, and even those
            // are used as a signal to refetch rather than merged into state:
            // the board's ranking is the view's job, not the client's.
            const narrowed = narrowAttempt(record)
            if (narrowed.puzzle_id === undefined) return
            onChange()
          },
        )
        .subscribe()

      return () => {
        void client.removeChannel(channel)
      }
    },
  }
}
