/**
 * leave-room — delete the caller's seat in a room.
 *
 * POST { roomId }
 *   -> 200 { roomId, playerId, playerName, wasHost }
 *
 * The semantics, and why the row is deleted rather than flagged, are in
 * `leave.ts`. This file is the plumbing every function shares: verify the
 * caller, count the request, validate the body, and translate a Postgres
 * rejection into the one error envelope.
 *
 * There is no delete grant on `players` for `authenticated`, deliberately, so
 * this cannot be done over REST. It has to be a function running as
 * `service_role`, which means the membership check in `performLeave` is doing
 * the authorisation Postgres would otherwise do.
 */

import { requireCaller } from '../_shared/auth.ts'
import { type PlayerRow, type ServiceClient, serviceClient } from '../_shared/db.ts'
import { mapPostgresError } from '../_shared/errors.ts'
import { jsonResponse, readJson, serveFunction } from '../_shared/http.ts'
import { enforceRateLimit } from '../_shared/rate-limit.ts'
import { LEAVE_ROOM_LIMIT, leaveRoomSchema, type LeaveRoomStore, performLeave } from './leave.ts'

const SEAT_COLUMNS = 'id, name'

function createStore(db: ServiceClient): LeaveRoomStore {
  return {
    async findSeat(roomId, userId) {
      const { data, error } = await db
        .from('players')
        .select(SEAT_COLUMNS)
        .eq('room_id', roomId)
        .eq('auth_user_id', userId)
        .maybeSingle()

      if (error) throw mapPostgresError(error)
      if (!data) return null

      const row = data as Pick<PlayerRow, 'id' | 'name'>
      return { playerId: row.id, playerName: row.name }
    },

    async findHostPlayerId(roomId) {
      const { data, error } = await db
        .from('rooms')
        .select('host_player_id')
        .eq('id', roomId)
        .maybeSingle()

      if (error) throw mapPostgresError(error)
      const row = data as { host_player_id: string | null } | null
      return row?.host_player_id ?? null
    },

    async deleteSeat(playerId) {
      const { error } = await db.from('players').delete().eq('id', playerId)
      if (error) throw mapPostgresError(error)
    },
  }
}

serveFunction(async (req) => {
  const caller = await requireCaller(req)
  const db = serviceClient()

  await enforceRateLimit(db, 'leave-room', caller.userId, LEAVE_ROOM_LIMIT)

  const body = await readJson(req, leaveRoomSchema)
  const result = await performLeave(createStore(db), {
    roomId: body.roomId,
    userId: caller.userId,
  })

  return jsonResponse(req, result)
})
