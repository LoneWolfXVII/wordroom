/**
 * join-room — look up a code and seat the caller.
 *
 * POST { code, playerName }
 *   -> 200 { room: Room, player: Player }
 *
 * Three things can go wrong and all three are decided by the database, not by
 * this file: capacity (a trigger), name uniqueness (a case-insensitive unique
 * index), and one seat per account (another unique index). Checking them here
 * first would be a race — two players can pass a `select count(*)` check at the
 * same moment and both insert. So we insert and translate the rejection.
 */

import { requireCaller } from '../_shared/auth.ts'
import {
  type PlayerRow,
  ROOM_PUBLIC_COLUMNS,
  type RoomPublicRow,
  serviceClient,
} from '../_shared/db.ts'
import { conflict, mapPostgresError, notFound } from '../_shared/errors.ts'
import { jsonResponse, readJson, serveFunction } from '../_shared/http.ts'
import { toPlayer, toRoom } from '../_shared/presenters.ts'
import { enforceRateLimit, JOIN_ROOM_LIMIT } from '../_shared/rate-limit.ts'
import { joinRoomSchema } from '../_shared/schemas.ts'

const PLAYER_COLUMNS = 'id, room_id, auth_user_id, name, settings, created_at'

serveFunction(async (req) => {
  const caller = await requireCaller(req)
  const db = serviceClient()

  await enforceRateLimit(db, 'join-room', caller.userId, JOIN_ROOM_LIMIT)

  const body = await readJson(req, joinRoomSchema)

  const { data: roomData, error: roomError } = await db
    .from('rooms')
    .select(ROOM_PUBLIC_COLUMNS)
    .eq('code', body.code)
    .maybeSingle()

  if (roomError) throw mapPostgresError(roomError)
  if (!roomData) throw notFound('room_not_found', 'No room has that code.')

  const room = roomData as RoomPublicRow
  if (room.archived_at) throw conflict('room_archived', 'This room has been archived.')

  // Rejoining from a second device, or tapping the button twice. Idempotent as
  // long as the name matches, because names are locked once confirmed.
  const { data: seatData, error: seatError } = await db
    .from('players')
    .select(PLAYER_COLUMNS)
    .eq('room_id', room.id)
    .eq('auth_user_id', caller.userId)
    .maybeSingle()

  if (seatError) throw mapPostgresError(seatError)

  if (seatData) {
    const existing = seatData as PlayerRow
    if (existing.name.toLowerCase() !== body.playerName.toLowerCase()) {
      throw conflict(
        'already_joined',
        `You are already in this room as ${existing.name}. Names cannot be changed.`,
      )
    }
    return jsonResponse(req, { room: toRoom(room), player: toPlayer(existing) })
  }

  const { data, error } = await db
    .from('players')
    .insert({ room_id: room.id, auth_user_id: caller.userId, name: body.playerName })
    .select(PLAYER_COLUMNS)
    .single()

  if (error) throw mapPostgresError(error)

  return jsonResponse(req, { room: toRoom(room), player: toPlayer(data as PlayerRow) })
})
