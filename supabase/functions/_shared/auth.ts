/**
 * Who is calling, and are they allowed to be in this room?
 *
 * The functions run as `service_role`, so RLS is not doing this for us. Both
 * halves are mandatory on every request that touches room data:
 *
 *   1. `requireCaller` — the bearer token is a real, unexpired Supabase JWT.
 *   2. `requireMembership` — that user has a `players` row in the room.
 *
 * Skipping (2) would let any signed-in stranger read another room's puzzles.
 */

import type { AttemptRow, PlayerRow, PuzzleRow, ServiceClient } from './db.ts'
import { AppError, forbidden, notFound, unauthorized } from './errors.ts'
import { verifyAccessToken } from './jwt.ts'

export interface Caller {
  userId: string
  isAnonymous: boolean
}

export function bearerToken(req: Request): string {
  const header = req.headers.get('authorization') ?? ''
  const match = /^bearer\s+(.+)$/i.exec(header.trim())
  const token = match?.[1]?.trim()
  if (!token) throw unauthorized('Missing bearer token.')
  return token
}

/**
 * Identify the caller from their access token.
 *
 * Verified locally against the project's published JWKS rather than by asking
 * GoTrue — see `jwt.ts` for why, and for what that trade gives up. This is on
 * the hot path of every guess.
 */
export async function requireCaller(req: Request): Promise<Caller> {
  const token = bearerToken(req)
  const claims = await verifyAccessToken(token)
  return { userId: claims.sub, isAnonymous: claims.is_anonymous === true }
}

/** The caller's player row in this room, or 403. */
export async function requireMembership(
  db: ServiceClient,
  roomId: string,
  userId: string,
): Promise<PlayerRow> {
  const { data, error } = await db
    .from('players')
    .select('id, room_id, auth_user_id, name, settings, created_at')
    .eq('room_id', roomId)
    .eq('auth_user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('membership lookup failed', error)
    throw new AppError('internal', 500, 'Something went wrong. Try again.')
  }
  // Deliberately the same answer whether the room is missing or the caller is
  // not in it: a stranger should not be able to probe which room ids exist.
  if (!data) throw forbidden('not_a_member', 'You are not a player in this room.')

  return data as PlayerRow
}

export interface PuzzleAccess {
  puzzle: PuzzleRow
  player: PlayerRow
}

/**
 * Load a puzzle *with its answer* plus the caller's player row, having checked
 * the caller belongs to the puzzle's room. Callers must not let the answer out.
 */
export async function requirePuzzleAccess(
  db: ServiceClient,
  puzzleId: string,
  userId: string,
): Promise<PuzzleAccess> {
  const { data, error } = await db
    .from('puzzles')
    .select('id, room_id, mode, number, answer, created_at')
    .eq('id', puzzleId)
    .maybeSingle()

  if (error) {
    console.error('puzzle lookup failed', error)
    throw new AppError('internal', 500, 'Something went wrong. Try again.')
  }
  if (!data) throw notFound('puzzle_not_found', 'That puzzle does not exist.')

  const puzzle = data as PuzzleRow
  const player = await requireMembership(db, puzzle.room_id, userId)
  return { puzzle, player }
}

/** The caller's own attempt row. Another player's attempt is never readable. */
export async function findOwnAttempt(
  db: ServiceClient,
  puzzleId: string,
  playerId: string,
): Promise<AttemptRow | null> {
  const { data, error } = await db
    .from('attempts')
    .select('*')
    .eq('puzzle_id', puzzleId)
    .eq('player_id', playerId)
    .maybeSingle()

  if (error) {
    console.error('attempt lookup failed', error)
    throw new AppError('internal', 500, 'Something went wrong. Try again.')
  }
  return (data as AttemptRow | null) ?? null
}
