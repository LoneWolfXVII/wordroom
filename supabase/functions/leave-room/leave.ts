/**
 * leave-room, with the plumbing lifted out so it can be tested.
 *
 * LEAVING IS A HARD LEAVE. The `players` row is deleted. Everything hanging off
 * it goes with it, and that is the point rather than a side effect:
 *
 *   - `attempts.player_id` is `on delete cascade`, so the leaver's scores in
 *     this room are gone. They do not linger on the leaderboard as a ghost.
 *   - `players_room_name_key` is a unique index, so deleting the row frees the
 *     locked name for someone else in this room.
 *   - `enforce_room_capacity` counts rows, so the seat is genuinely free again.
 *   - `rooms_host_player_fk` is `on delete set null`, so a departing host leaves
 *     the room hostless rather than taking it down.
 *
 * The alternative — a `left_at` flag — would keep the row, and with it a name
 * nobody can reuse and a leaderboard entry for someone who is not here. That is
 * not what "leave" means.
 *
 * It is irreversible, and the UI says so before it calls this.
 *
 * Nothing here reads a puzzle, an attempt or a word. The response is built field
 * by field below, in the same discipline as `_shared/presenters.ts`, and there is
 * no row in scope that could carry an answer into it.
 */

import { z } from 'zod'
import { forbidden } from '../_shared/errors.ts'
import type { RateLimit } from '../_shared/rate-limit.ts'

/**
 * Leaving is rare and destructive; a human does it once. The budget is only
 * here to stop a loop, and it is deliberately looser than `create-room` because
 * a legitimate player who leaves and rejoins a few times is not abusing us.
 */
export const LEAVE_ROOM_LIMIT: RateLimit = { max: 20, windowSeconds: 3600 }

export const leaveRoomSchema = z.object({
  roomId: z.uuid('Expected a room id.'),
})
export type LeaveRoomRequest = z.infer<typeof leaveRoomSchema>

/** The seat that was removed. Four scalars; nothing that could hold a word. */
export interface LeaveRoomBody {
  roomId: string
  playerId: string
  playerName: string
  /** True when the room's `host_player_id` has just been set null by the delete. */
  wasHost: boolean
}

export interface LeaveRoomSeat {
  playerId: string
  playerName: string
}

/**
 * The three database operations a leave needs, as a port.
 *
 * `index.ts` implements this over the service-role client; the tests implement
 * it over a plain object. Keeping the handler free of Supabase is what makes
 * "you cannot leave a room you are not in" a unit test rather than a manual
 * check against a live project.
 */
export interface LeaveRoomStore {
  /** The caller's seat in this room, or null when they hold none. */
  findSeat(roomId: string, userId: string): Promise<LeaveRoomSeat | null>
  /** `rooms.host_player_id`, read before the delete sets it null. */
  findHostPlayerId(roomId: string): Promise<string | null>
  deleteSeat(playerId: string): Promise<void>
}

export interface LeaveRoomInput {
  roomId: string
  userId: string
}

/**
 * Remove the caller's seat.
 *
 * These functions run as `service_role` and so bypass RLS — the membership
 * check below is the only thing standing between a signed-in stranger and
 * someone else's room, exactly as in every other handler.
 *
 * A caller with no seat and a caller naming a room that does not exist get the
 * same 403, so room ids cannot be probed.
 */
export async function performLeave(
  store: LeaveRoomStore,
  input: LeaveRoomInput,
): Promise<LeaveRoomBody> {
  const seat = await store.findSeat(input.roomId, input.userId)
  if (!seat) throw forbidden('not_a_member', 'You are not a player in this room.')

  // Read the host before the delete, because the foreign key nulls it.
  const hostPlayerId = await store.findHostPlayerId(input.roomId)

  await store.deleteSeat(seat.playerId)

  return {
    roomId: input.roomId,
    playerId: seat.playerId,
    playerName: seat.playerName,
    wasHost: hostPlayerId === seat.playerId,
  }
}
