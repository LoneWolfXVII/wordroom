/**
 * create-room — allocate a code, create the room and the host's player row.
 *
 * POST { roomName, playerName, timezone? }
 *   -> 201 { room: Room, player: Player }
 *
 * `timezone` comes from the caller (the host's browser) and decides when the
 * weekly leaderboard rolls over. It defaults to UTC when omitted.
 */

import { requireCaller } from '../_shared/auth.ts'
import { generateRoomCode } from '../_shared/codes.ts'
import {
  type PlayerRow,
  ROOM_PUBLIC_COLUMNS,
  type RoomPublicRow,
  serviceClient,
} from '../_shared/db.ts'
import { AppError, conflict, mapPostgresError } from '../_shared/errors.ts'
import { jsonResponse, readJson, serveFunction } from '../_shared/http.ts'
import { toPlayer, toRoom } from '../_shared/presenters.ts'
import { CREATE_ROOM_LIMIT, enforceRateLimit } from '../_shared/rate-limit.ts'
import { createRoomSchema } from '../_shared/schemas.ts'

/**
 * 32^4 is a million codes, so a collision is rare but not impossible once a few
 * thousand rooms exist. The unique index is the referee; we just try again.
 */
const CODE_ATTEMPTS = 8

serveFunction(async (req) => {
  const caller = await requireCaller(req)
  const db = serviceClient()

  await enforceRateLimit(db, 'create-room', caller.userId, CREATE_ROOM_LIMIT)

  const body = await readJson(req, createRoomSchema)
  const timezone = body.timezone ?? 'UTC'

  let room: RoomPublicRow | null = null
  for (let attempt = 0; attempt < CODE_ATTEMPTS && room === null; attempt++) {
    const { data, error } = await db
      .from('rooms')
      // `seed` is left out of the projection deliberately: this function has no
      // use for it, so it never enters the isolate's memory.
      .insert({ code: generateRoomCode(), name: body.roomName, timezone })
      .select(ROOM_PUBLIC_COLUMNS)
      .single()

    if (!error) {
      room = data as RoomPublicRow
      break
    }

    const mapped = mapPostgresError(error)
    if (mapped.code !== 'code_unavailable') throw mapped
  }

  if (!room) {
    console.error(`could not allocate a room code in ${CODE_ATTEMPTS} attempts`)
    throw conflict('code_unavailable', 'Could not allocate a room code. Try again.')
  }

  // From here on the room exists. If seating the host fails, take it back out
  // rather than leaving an empty room holding a code nobody can use.
  let player: PlayerRow
  try {
    const { data, error } = await db
      .from('players')
      .insert({ room_id: room.id, auth_user_id: caller.userId, name: body.playerName })
      .select('id, room_id, auth_user_id, name, settings, created_at')
      .single()

    if (error) throw mapPostgresError(error)
    player = data as PlayerRow
  } catch (cause) {
    await db.from('rooms').delete().eq('id', room.id)
    throw cause instanceof AppError
      ? cause
      : new AppError('internal', 500, 'Something went wrong. Try again.')
  }

  const { data: hosted, error: hostError } = await db
    .from('rooms')
    .update({ host_player_id: player.id })
    .eq('id', room.id)
    .select(ROOM_PUBLIC_COLUMNS)
    .single()

  if (hostError) throw mapPostgresError(hostError)

  return jsonResponse(req, { room: toRoom(hosted as RoomPublicRow), player: toPlayer(player) }, 201)
})
