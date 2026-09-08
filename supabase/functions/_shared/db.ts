/**
 * The service-role client and the row shapes the functions read.
 *
 * WHY SERVICE ROLE: scoring a guess needs `puzzles.answer`, and no client role
 * has a grant on that column — by design (see the RLS migration). So these
 * functions run as `service_role`, which bypasses RLS entirely.
 *
 * THE COST OF THAT: the database will not check membership for us any more.
 * Every handler must call `requireMembership` (auth.ts) before it touches a
 * room's data. Authorisation is our job here, not Postgres's.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  DEFAULT_PLAYER_SETTINGS,
  type Mode,
  type PlayerSettings,
  type TimerMode,
} from '@wordroom/shared'
import { AppError } from './errors.ts'

export interface RoomRow {
  id: string
  code: string
  name: string
  host_player_id: string | null
  max_players: number
  /** SECRET. Every answer the room will ever use derives from this. */
  seed: string
  timezone: string
  created_at: string
  archived_at: string | null
}

/** Room columns that are safe to select when the seed is not needed. */
export const ROOM_PUBLIC_COLUMNS =
  'id, code, name, host_player_id, max_players, timezone, created_at, archived_at'

export type RoomPublicRow = Omit<RoomRow, 'seed'>

export interface PlayerRow {
  id: string
  room_id: string
  auth_user_id: string | null
  name: string
  settings: PlayerSettings
  created_at: string
}

export interface PuzzleRow {
  id: string
  room_id: string
  mode: Mode
  number: number
  /** SECRET. Never serialise this into a response body. */
  answer: string
  created_at: string
}

export interface AttemptRow {
  id: string
  player_id: string
  puzzle_id: string
  guesses: string[]
  /** One encoded MarkRow per guess — see marks.ts for the codec. */
  marks: string[]
  solved: boolean
  guess_count: number
  elapsed_ms: number | null
  timer_mode: TimerMode
  hard_mode: boolean
  started_at: string
  finished_at: string | null
}

export type ServiceClient = SupabaseClient

const TIMER_MODES: readonly TimerMode[] = ['off', 'per-puzzle', 'per-guess', 'sprint']

/**
 * `players.settings` is a jsonb column, so it can be any shape the day someone
 * writes a partial object to it. Read it defensively rather than trusting it —
 * `hardMode` in particular decides whether a guess is rejected.
 */
export function readSettings(row: PlayerRow): PlayerSettings {
  const raw = (row.settings ?? {}) as Partial<PlayerSettings>
  const timerMode = typeof raw.timerMode === 'string' && TIMER_MODES.includes(raw.timerMode)
    ? raw.timerMode
    : DEFAULT_PLAYER_SETTINGS.timerMode

  return {
    timerMode,
    perPuzzleSeconds:
      typeof raw.perPuzzleSeconds === 'number' && Number.isFinite(raw.perPuzzleSeconds)
        ? raw.perPuzzleSeconds
        : DEFAULT_PLAYER_SETTINGS.perPuzzleSeconds,
    hardMode: raw.hardMode === true,
  }
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) {
    console.error(`missing environment variable ${name}`)
    throw new AppError('internal', 500, 'Server is misconfigured.')
  }
  return value
}

export function supabaseUrl(): string {
  return requireEnv('SUPABASE_URL')
}

/**
 * A client with the service role key. Auth persistence is off: this client is
 * shared by every request in the isolate and must never pick up a user session.
 */
export function serviceClient(): ServiceClient {
  return createClient(supabaseUrl(), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
