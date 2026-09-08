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
import type { PuzzleRow, RoomRow, ServiceClient } from './db.ts'
import { AppError, conflict, mapPostgresError, notFound } from './errors.ts'

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

async function selectPuzzle(
  db: ServiceClient,
  roomId: string,
  mode: Mode,
  number: number,
): Promise<PuzzleRow | null> {
  const { data, error } = await db
    .from('puzzles')
    .select('id, room_id, mode, number, answer, created_at')
    .eq('room_id', roomId)
    .eq('mode', mode)
    .eq('number', number)
    .maybeSingle()

  if (error) throw mapPostgresError(error)
  return (data as PuzzleRow | null) ?? null
}

async function deriveAnswer(db: ServiceClient, seed: string, mode: Mode, number: number) {
  const { count, error: countError } = await db
    .from('word_bank')
    .select('word', { count: 'exact', head: true })
    .eq('len', mode)

  if (countError) throw mapPostgresError(countError)
  if (!count) {
    console.error(`word_bank has no ${mode}-letter answers; run pnpm seed:wordbank`)
    throw new AppError('word_bank_empty', 500, 'No answers are available for this mode.')
  }

  const index = await puzzleIndex(seed, mode, number, count)

  // `rank` is unique within a length, but ordering by word too makes the
  // sequence stable even if a future seed ever repeats a rank.
  const { data, error } = await db
    .from('word_bank')
    .select('word')
    .eq('len', mode)
    .order('rank', { ascending: true })
    .order('word', { ascending: true })
    .range(index, index)

  if (error) throw mapPostgresError(error)

  const word = (data as { word: string }[] | null)?.[0]?.word
  if (!word) {
    console.error(`word_bank index ${index} of ${count} returned nothing for mode ${mode}`)
    throw new AppError('word_bank_empty', 500, 'No answers are available for this mode.')
  }
  return word
}

/** Highest puzzle number the room has reached in this mode; 0 if none yet. */
export async function highestNumber(
  db: ServiceClient,
  roomId: string,
  mode: Mode,
): Promise<number> {
  const { data, error } = await db
    .from('puzzles')
    .select('number')
    .eq('room_id', roomId)
    .eq('mode', mode)
    .order('number', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw mapPostgresError(error)
  return (data as { number: number } | null)?.number ?? 0
}

/**
 * Return the puzzle for (room, mode, number), creating it on first request.
 *
 * SERVER ONLY — the returned row carries the answer.
 */
export async function materialisePuzzle(
  db: ServiceClient,
  room: RoomRow,
  mode: Mode,
  number: number,
): Promise<PuzzleRow> {
  const existing = await selectPuzzle(db, room.id, mode, number)
  if (existing) return existing

  const answer = await deriveAnswer(db, room.seed, mode, number)

  const { data, error } = await db
    .from('puzzles')
    .insert({ room_id: room.id, mode, number, answer })
    .select('id, room_id, mode, number, answer, created_at')
    .single()

  if (error) {
    // Another request materialised the same puzzle a moment ago. Both derived
    // the same word, so re-reading is not just safe, it is identical.
    const raced = await selectPuzzle(db, room.id, mode, number)
    if (raced) return raced
    throw mapPostgresError(error)
  }

  return data as PuzzleRow
}

export async function loadRoomForMember(db: ServiceClient, roomId: string): Promise<RoomRow> {
  const { data, error } = await db.from('rooms').select('*').eq('id', roomId).maybeSingle()
  if (error) throw mapPostgresError(error)
  if (!data) throw notFound('room_not_found', 'That room does not exist.')

  const room = data as RoomRow
  if (room.archived_at) throw conflict('room_archived', 'This room has been archived.')
  return room
}
