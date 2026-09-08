/**
 * Deriving and materialising a room's puzzle sequence.
 *
 * The answer for (room, mode, number) is a pure function of the room's secret
 * seed:
 *
 *     index  = sha256(`${seed}|${mode}|${number}`) mod count(word_bank[mode])
 *     answer = word_bank[mode] ordered by rank, at that index
 *
 * Deterministic, so every player in the room gets the same word for the same
 * number, and re-deriving it after a row is lost gives the same answer back.
 * The row is still written to `puzzles` on first request, because that row is
 * what `attempts` references and what fixes the answer even if the word bank is
 * later reordered.
 *
 * `seed` is as secret as an answer: it derives every answer the room will ever
 * use. It has no column grant for any client role, and it must never appear in
 * a response body or a log line.
 */

import type { Mode } from '@wordroom/shared'
import type { PlayerRow, PuzzleRow, RoomRow, ServiceClient } from './db.ts'
import { AppError, conflict, forbidden, mapPostgresError } from './errors.ts'

/** The exact string that is hashed. Written down so tests can pin it. */
export function puzzleDigestInput(seed: string, mode: Mode, number: number): string {
  return `${seed}|${mode}|${number}`
}

/**
 * Index into the rank-ordered word bank. Uses the first 8 bytes of the digest
 * as an unsigned integer; the residual modulo bias over a 64-bit value against
 * a bank of a few thousand words is far below one part in 10^15.
 */
export async function puzzleIndex(
  seed: string,
  mode: Mode,
  number: number,
  count: number,
): Promise<number> {
  if (count <= 0) throw new AppError('word_bank_empty', 500, 'No answers are available.')

  const bytes = new TextEncoder().encode(puzzleDigestInput(seed, mode, number))
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))

  let value = 0n
  for (let i = 0; i < 8; i++) {
    value = (value << 8n) | BigInt(digest[i] ?? 0)
  }
  return Number(value % BigInt(count))
}

export interface PuzzleContext {
  room: RoomRow
  player: PlayerRow
  /** Highest number the room has reached in this mode; 0 if none yet. */
  reached: number
  /** The puzzle asked for, if it has been materialised. */
  puzzle: PuzzleRow | null
  /** How many answers this mode has, for the modulo. */
  bankCount: number
}

interface PuzzleContextRow {
  room: RoomRow
  player: PlayerRow
  reached: number
  puzzle: PuzzleRow | null
  bank_count: number
}

/**
 * Everything the handler needs before it can answer, in one round trip.
 *
 * SERVER ONLY — `room` carries `seed`.
 *
 * No row means the caller is not a player in this room. It also means the room
 * does not exist, and the two are deliberately indistinguishable: a stranger
 * should not be able to probe which room ids are real. That was already true of
 * the membership check this replaces.
 */
export async function loadPuzzleContext(
  db: ServiceClient,
  roomId: string,
  mode: Mode,
  number: number,
  userId: string,
): Promise<PuzzleContext> {
  const { data, error } = await db
    .rpc('puzzle_context', {
      p_room_id: roomId,
      p_mode: mode,
      p_number: number,
      p_user_id: userId,
    })
    .maybeSingle()

  if (error) throw mapPostgresError(error)
  if (!data) throw forbidden('not_a_member', 'You are not a player in this room.')

  const row = data as PuzzleContextRow
  if (row.room.archived_at) throw conflict('room_archived', 'This room has been archived.')

  return {
    room: row.room,
    player: row.player,
    reached: row.reached,
    puzzle: row.puzzle,
    bankCount: row.bank_count,
  }
}

/**
 * Return the puzzle for (room, mode, number), creating it on first request.
 *
 * SERVER ONLY — the returned row carries the answer.
 *
 * Free when the puzzle already exists: the context read has it. Otherwise one
 * more round trip, and only one, because the index is derived here. That is not
 * an arbitrary split — `seed` is as secret as an answer and never leaves the
 * server, so the hash has to happen between the two queries. Pushing it into
 * SQL would put a second definition of the sequence in a second language, and
 * the sequence has to stay reproducible for the life of a room.
 */
export async function materialisePuzzle(
  db: ServiceClient,
  context: PuzzleContext,
  mode: Mode,
  number: number,
): Promise<PuzzleRow> {
  if (context.puzzle) return context.puzzle

  if (context.bankCount <= 0) {
    console.error(`word_bank has no ${mode}-letter answers; run pnpm seed:wordbank`)
    throw new AppError('word_bank_empty', 500, 'No answers are available for this mode.')
  }

  const index = await puzzleIndex(context.room.seed, mode, number, context.bankCount)

  const { data, error } = await db.rpc('materialise_puzzle', {
    p_room_id: context.room.id,
    p_mode: mode,
    p_number: number,
    p_index: index,
  })

  if (error) throw mapPostgresError(error)

  const row = data as PuzzleRow | null
  if (!row) {
    console.error(`word_bank index ${index} of ${context.bankCount} returned nothing for ${mode}`)
    throw new AppError('word_bank_empty', 500, 'No answers are available for this mode.')
  }
  return row
}
