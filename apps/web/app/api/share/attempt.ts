import { decodeMarks, type MarkRow, type TimerMode } from '@wordroom/shared'
import { supabaseEnv } from '@/lib/supabase/env'

/**
 * Reading an attempt back as its owner, for the share-image mint.
 *
 * This talks to PostgREST with the *caller's* access token and the public anon
 * key. There is no service role anywhere near it, which is the point: the
 * question "may this person see these guesses?" is answered by RLS, by the
 * `my_attempts` view's `auth.uid()` filter, and not by a line of TypeScript that
 * someone could later get wrong. If the caller does not own the attempt, the
 * query comes back empty.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** PostgREST filters are string-interpolated, so ids are shape-checked first. */
export function isUuid(value: string): boolean {
  return UUID.test(value)
}

export interface OwnedAttempt {
  id: string
  puzzleNumber: number
  roomCode: string
  guesses: string[]
  marks: MarkRow[]
  solved: boolean
  hardMode: boolean
  /** Null when the timer was off — the share text adds no time in that case. */
  elapsedMs: number | null
  finished: boolean
}

export type AttemptLookup =
  | { ok: true; attempt: OwnedAttempt }
  | { ok: false; status: number; code: string; message: string }

interface AttemptRow {
  id: string
  puzzle_id: string
  guesses: string[]
  marks: string[]
  solved: boolean
  elapsed_ms: number | null
  timer_mode: TimerMode
  hard_mode: boolean
  finished_at: string | null
}

interface PuzzleRow {
  number: number
  room_id: string
}

interface RoomRow {
  code: string
}

async function selectOne<T>(base: string, path: string, headers: HeadersInit): Promise<T | null> {
  const response = await fetch(`${base}/${path}&limit=1`, { headers, cache: 'no-store' })
  if (!response.ok) return null
  const rows: unknown = await response.json()
  if (!Array.isArray(rows) || rows.length === 0) return null
  return rows[0] as T
}

/**
 * The attempt, its puzzle number and its room code — or the reason the caller
 * may not have them.
 *
 * Three round trips rather than one embed, because `my_attempts`, `room_puzzles`
 * and `room_details` are views and PostgREST cannot follow a foreign key through
 * one. This runs on the mint, once per share, never on the image itself.
 */
export async function loadOwnedAttempt(
  attemptId: string,
  accessToken: string,
): Promise<AttemptLookup> {
  const { url, anonKey } = supabaseEnv()
  const base = `${url}/rest/v1`
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
  }

  const columns = 'id,puzzle_id,guesses,marks,solved,elapsed_ms,timer_mode,hard_mode,finished_at'
  const attempt = await selectOne<AttemptRow>(
    base,
    `my_attempts?id=eq.${attemptId}&select=${columns}`,
    headers,
  )

  // Not found and not yours are the same answer on purpose. Telling a stranger
  // that an id exists but belongs to someone else is a fact they did not have.
  if (!attempt) {
    return {
      ok: false,
      status: 404,
      code: 'attempt_not_found',
      message: 'No attempt of yours with that id.',
    }
  }

  if (attempt.finished_at === null) {
    return {
      ok: false,
      status: 409,
      code: 'attempt_unfinished',
      message: 'This puzzle is still in play.',
    }
  }

  const puzzle = await selectOne<PuzzleRow>(
    base,
    `room_puzzles?id=eq.${attempt.puzzle_id}&select=number,room_id`,
    headers,
  )
  if (!puzzle) {
    return { ok: false, status: 404, code: 'puzzle_not_found', message: 'Puzzle not found.' }
  }

  const room = await selectOne<RoomRow>(
    base,
    `room_details?id=eq.${puzzle.room_id}&select=code`,
    headers,
  )
  if (!room) {
    return { ok: false, status: 404, code: 'room_not_found', message: 'Room not found.' }
  }

  let marks: MarkRow[]
  try {
    marks = decodeMarks(attempt.marks)
  } catch {
    return { ok: false, status: 500, code: 'internal', message: 'Could not read that result.' }
  }

  return {
    ok: true,
    attempt: {
      id: attempt.id,
      puzzleNumber: puzzle.number,
      roomCode: room.code,
      guesses: attempt.guesses,
      marks,
      solved: attempt.solved,
      hardMode: attempt.hard_mode,
      elapsedMs: attempt.timer_mode === 'off' ? null : attempt.elapsed_ms,
      finished: true,
    },
  }
}
