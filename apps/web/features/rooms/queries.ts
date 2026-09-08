import type { SupabaseClient } from '@supabase/supabase-js'
import type { Player, Room } from '@wordroom/shared'
import { z } from 'zod'
import { ApiError } from './errors'
import { playerSettingsSchema } from './schemas'

/**
 * Direct table reads, for the things an Edge Function is the wrong tool for:
 * who is in the room, and which room am I in.
 *
 * These go through PostgREST as the signed-in user, so RLS decides what comes
 * back. Two policies matter here and both are load-bearing:
 *
 * - `rooms_select_member` means a room is invisible until you are in it. There
 *   is no "look up this code before joining" query to write, which is why the
 *   join screen has no room preview.
 * - `players_select_member` means members see each other and nobody else.
 *
 * Rows are snake_case here — unlike the Edge Function bodies, which are already
 * mapped — so each shape is parsed and renamed on the way in.
 */

/** `public.room_details` — the seed-free projection. Never select `rooms` directly. */
const roomRowSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  host_player_id: z.string().nullable(),
  max_players: z.number().int(),
  timezone: z.string(),
  created_at: z.string(),
  archived_at: z.string().nullable(),
})

const playerRowSchema = z.object({
  id: z.string(),
  room_id: z.string(),
  auth_user_id: z.string().nullable(),
  name: z.string(),
  settings: playerSettingsSchema,
  created_at: z.string(),
})

const ROOM_COLUMNS =
  'id, code, name, host_player_id, max_players, timezone, created_at, archived_at'
const PLAYER_COLUMNS = 'id, room_id, auth_user_id, name, settings, created_at'

function toRoom(row: z.infer<typeof roomRowSchema>): Room {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    hostPlayerId: row.host_player_id,
    maxPlayers: row.max_players,
    timezone: row.timezone,
    createdAt: row.created_at,
    archivedAt: row.archived_at,
  }
}

function toPlayer(row: z.infer<typeof playerRowSchema>): Player {
  return {
    id: row.id,
    roomId: row.room_id,
    authUserId: row.auth_user_id,
    name: row.name,
    settings: row.settings,
    createdAt: row.created_at,
  }
}

/** PostgREST failures become the same `ApiError` the Edge Functions produce. */
function fail(message: string): never {
  throw new ApiError('internal', message)
}

/**
 * Every seat this account holds, newest first.
 *
 * This — not `localStorage` — is the truth about which rooms a player belongs
 * to. A stored room id is a preference about which one to open; a row here is
 * the membership itself, and it survives clearing site data because it is keyed
 * on the auth user.
 */
export async function fetchMySeats(client: SupabaseClient, userId: string): Promise<Player[]> {
  const { data, error } = await client
    .from('players')
    .select(PLAYER_COLUMNS)
    .eq('auth_user_id', userId)
    .order('created_at', { ascending: false })

  if (error) fail(error.message)
  return z
    .array(playerRowSchema)
    .parse(data ?? [])
    .map(toPlayer)
}

/** One room by id, or null when the caller is not a member of it. */
export async function fetchRoom(client: SupabaseClient, roomId: string): Promise<Room | null> {
  const { data, error } = await client
    .from('room_details')
    .select(ROOM_COLUMNS)
    .eq('id', roomId)
    .maybeSingle()

  if (error) fail(error.message)
  if (!data) return null
  return toRoom(roomRowSchema.parse(data))
}

/**
 * Everyone in the room, in join order — so the host, who was seated first, leads
 * the list the way the prototype's member list does.
 */
export async function fetchMembers(client: SupabaseClient, roomId: string): Promise<Player[]> {
  const { data, error } = await client
    .from('players')
    .select(PLAYER_COLUMNS)
    .eq('room_id', roomId)
    .order('created_at', { ascending: true })

  if (error) fail(error.message)
  return z
    .array(playerRowSchema)
    .parse(data ?? [])
    .map(toPlayer)
}
