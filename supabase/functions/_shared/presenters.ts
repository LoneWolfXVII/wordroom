/**
 * Database rows in, client-safe JSON out.
 *
 * Every response body in this project is built here, field by field. Nothing
 * spreads a row (`{ ...puzzle }`) into a response: a spread is how `answer` and
 * `seed` escape the day someone adds a column.
 */

import type { Attempt, MarkRow, Mode, Player, Puzzle, Room } from '@wordroom/shared'
import { MAX_GUESSES, points } from '@wordroom/shared'
import type { AttemptRow, PlayerRow, PuzzleRow, RoomRow } from './db.ts'
import { AppError } from './errors.ts'
import { decodeMarks } from './marks.ts'

export function toRoom(row: RoomRow | Omit<RoomRow, 'seed'>): Room {
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

export function toPlayer(row: PlayerRow): Player {
  return {
    id: row.id,
    roomId: row.room_id,
    authUserId: row.auth_user_id,
    name: row.name,
    settings: row.settings,
    createdAt: row.created_at,
  }
}

/**
 * `PuzzleRow` carries the answer; `Puzzle` is the type that has no room for it.
 * Returning `Puzzle` is the whole point of this function.
 */
export function toPuzzle(row: PuzzleRow): Puzzle {
  return {
    id: row.id,
    roomId: row.room_id,
    mode: row.mode,
    number: row.number,
  }
}

export function toAttempt(row: AttemptRow): Attempt {
  return {
    id: row.id,
    playerId: row.player_id,
    puzzleId: row.puzzle_id,
    guesses: row.guesses,
    marks: decodeMarks(row.marks),
    solved: row.solved,
    guessCount: row.guess_count,
    elapsedMs: row.elapsed_ms,
    timerMode: row.timer_mode,
    hardMode: row.hard_mode,
    finishedAt: row.finished_at,
  }
}

/**
 * Marks are a closed, public vocabulary. They are structure, not data — the
 * client knows all three strings before it ever sends a guess. Two of them
 * ("absent", "present") and one more ("correct") are also answers, so they are
 * exempt where marks live and nowhere else.
 */
const MARK_WORDS: ReadonlySet<string> = new Set(['correct', 'present', 'absent'])

/**
 * UUIDs are hex, and two answers ("decade", "facade") are spellable in hex, so
 * an id can contain an answer by pure chance. Blanked before the check.
 */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g

function leaks(value: unknown, answer: string, inMarks: boolean): boolean {
  if (typeof value === 'string') {
    const text = value.toLowerCase()
    if (inMarks && MARK_WORDS.has(text)) return false
    return text.replaceAll(UUID, '<id>').includes(answer)
  }
  if (Array.isArray(value)) return value.some((item) => leaks(item, answer, inMarks))
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).some(([key, item]) => leaks(item, answer, key === 'marks'))
  }
  // Numbers, booleans, null: nothing a word can hide in.
  return false
}

/**
 * Last line of defence. Cheap enough to run on every response that is supposed
 * to be answer-free, and it turns a future refactor's mistake into a 500 here
 * rather than a spoiler in someone's network tab.
 *
 * It walks *values*, not the serialised body. Scanning `JSON.stringify(body)`
 * reads as the stricter check and is in fact broken: the JSON text carries the
 * field names and the boolean literals too, and eleven answers in the
 * 4,864-word bank are substrings of it — `false`, `solve`, `guess`, `tempt`,
 * `absent`, `puzzle`, `remain`, `finish`, `correct`, `present`, `attempt`, one
 * for every mode. Those rooms answered every guess with a 500, and `false` is
 * the worst of them, because `"solved":false` is in every unfinished body.
 *
 * Keys are written here and can never carry an answer; only values can. So only
 * values are checked — which is also the stricter reading of the rule.
 */
export function assertAnswerAbsent(body: unknown, answer: string): void {
  if (leaks(body, answer.toLowerCase(), false)) {
    console.error('refused to send a response containing the puzzle answer')
    throw new AppError('internal', 500, 'Something went wrong. Try again.')
  }
}

export interface GuessResultBody {
  attemptId: string
  puzzleId: string
  /** Marks for the guess just played; null when the request was a timeout. */
  marks: MarkRow | null
  guessCount: number
  guessesRemaining: number
  solved: boolean
  finished: boolean
  /** Present only once the attempt is over. */
  answer?: string
  points?: number
  finishedAt?: string
  elapsedMs?: number | null
}

export interface GuessResultInput {
  attemptId: string
  puzzleId: string
  marks: MarkRow | null
  guessCount: number
  solved: boolean
  finishedAt: string | null
  elapsedMs: number | null
  answer: string
}

/**
 * The one place the answer may enter a `submit-guess` response, and only when
 * `finishedAt` is set — solved, out of guesses, or timed out. While the attempt
 * is live the body is verified to be free of it before it is returned.
 */
export function guessResultBody(input: GuessResultInput): GuessResultBody {
  const base: GuessResultBody = {
    attemptId: input.attemptId,
    puzzleId: input.puzzleId,
    marks: input.marks,
    guessCount: input.guessCount,
    guessesRemaining: Math.max(MAX_GUESSES - input.guessCount, 0),
    solved: input.solved,
    finished: input.finishedAt !== null,
  }

  if (input.finishedAt === null) {
    assertAnswerAbsent(base, input.answer)
    return base
  }

  return {
    ...base,
    answer: input.answer,
    points: points(input.guessCount, input.solved),
    finishedAt: input.finishedAt,
    elapsedMs: input.elapsedMs,
  }
}

export interface RevealBody {
  attemptId: string
  puzzleId: string
  mode: Mode
  number: number
  answer: string
  solved: boolean
  guessCount: number
  guesses: string[]
  marks: MarkRow[]
  points: number
  elapsedMs: number | null
  finishedAt: string
}
