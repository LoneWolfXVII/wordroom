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

/**
 * The exact string that is hashed. Written down so tests can pin it.
 *
 * Note what is *not* in it: the puzzle number. One hash keys one shuffle, and
 * the number picks a position in that shuffle. Hashing the number instead is
 * exactly the mistake this replaced.
 */
export function puzzleDigestInput(seed: string, mode: Mode, epoch: number): string {
  return `${seed}|${mode}|epoch:${epoch}`
}

/**
 * xoshiro128**, seeded from a digest.
 *
 * A shuffle needs a stream of random numbers, and it has to be the *same*
 * stream every time or a room's sequence would move under it. This is the
 * smallest well-specified generator that gives 128 bits of state, which matters
 * because the state is the whole seed: fold a 128-bit room seed into 32 bits and
 * distinct rooms start sharing a running order.
 */
function xoshiro128(digest: Uint8Array): () => number {
  const read = (at: number) =>
    ((digest[at] ?? 0) << 24) | ((digest[at + 1] ?? 0) << 16) | ((digest[at + 2] ?? 0) << 8) |
    (digest[at + 3] ?? 0)

  let a = read(0) || 1
  let b = read(4) || 2
  let c = read(8) || 3
  let d = read(12) || 4

  return () => {
    const rotated = (b * 5) | 0
    const result = ((((rotated << 7) | (rotated >>> 25)) | 0) * 9) | 0
    const t = (b << 9) | 0
    c ^= a
    d ^= b
    b ^= c
    a ^= d
    c ^= t
    d = (d << 11) | (d >>> 21)
    return result >>> 0
  }
}

/**
 * The order a room plays its answers in.
 *
 * **This is a permutation, not a draw, and that is the point.** The old
 * derivation hashed `seed|mode|number` and took it modulo the bank size — an
 * independent pick each time, which collides at roughly the square root of the
 * bank rather than at the end of it. Simulated over 3,000 rooms against the real
 * 1,664-word five-letter bank: half of them repeated a word by puzzle **49**,
 * a tenth by puzzle 19, and the unluckiest at puzzle 2. Ten times the words
 * would only have pushed that to about 160. It was never a word-list problem.
 *
 * Shuffling instead means a room sees every answer once before it sees any
 * answer twice. `epoch` re-keys the shuffle each time a room exhausts the bank,
 * so the wrap is a fresh order rather than a replay of the first.
 *
 * Fisher-Yates over ~1,600 items runs in microseconds and only runs when a
 * puzzle is first materialised, so the cost is nothing. An O(1) format
 * preserving permutation would also work and would be far harder to be sure of.
 */
export async function puzzleIndex(
  seed: string,
  mode: Mode,
  number: number,
  count: number,
): Promise<number> {
  if (count <= 0) throw new AppError('word_bank_empty', 500, 'No answers are available.')

  const epoch = Math.floor((number - 1) / count)
  const position = (number - 1) % count

  const bytes = new TextEncoder().encode(puzzleDigestInput(seed, mode, epoch))
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  const next = xoshiro128(digest)

  const order = new Uint32Array(count)
  for (let i = 0; i < count; i++) order[i] = i
  for (let i = count - 1; i > 0; i--) {
    // Rejection-free enough at this size: the modulo bias over 2^32 against a
    // bound of a few thousand is far below anything a player could perceive.
    const j = next() % (i + 1)
    const swap = order[i] as number
    order[i] = order[j] as number
    order[j] = swap
  }

  return order[position] as number
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
