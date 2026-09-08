/**
 * One error envelope for every function.
 *
 * Postgres error text never reaches the client: a raw `duplicate key value
 * violates unique constraint "players_room_name_key"` tells an attacker the
 * shape of the schema and tells the player nothing useful. Everything is mapped
 * to a stable `code` the UI can switch on plus a sentence a human can read.
 *
 * SECURITY: `details` is deliberately typed to primitives. Nothing that could
 * carry a puzzle answer may be put in an error body.
 */

export type ErrorCode =
  // transport / generic
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'method_not_allowed'
  | 'rate_limited'
  | 'internal'
  // rooms
  | 'invalid_timezone'
  | 'room_not_found'
  | 'room_archived'
  | 'room_full'
  | 'name_taken'
  | 'already_joined'
  | 'code_unavailable'
  | 'not_a_member'
  // puzzles
  | 'puzzle_not_found'
  | 'puzzle_out_of_sequence'
  | 'word_bank_empty'
  // guesses
  | 'wrong_length'
  | 'not_a_word'
  | 'hard_mode_violation'
  | 'attempt_finished'
  | 'attempt_not_found'
  | 'attempt_not_finished'
  | 'guess_in_flight'

export type ErrorDetails = Record<string, string | number | boolean>

export class AppError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly details: ErrorDetails | undefined

  constructor(code: ErrorCode, status: number, message: string, details?: ErrorDetails) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = status
    this.details = details
  }
}

export const badRequest = (message: string, details?: ErrorDetails) =>
  new AppError('bad_request', 400, message, details)

export const unauthorized = (message = 'Sign in to continue.') =>
  new AppError('unauthorized', 401, message)

export const forbidden = (code: ErrorCode, message: string) => new AppError(code, 403, message)

export const notFound = (code: ErrorCode, message: string) => new AppError(code, 404, message)

export const conflict = (code: ErrorCode, message: string, details?: ErrorDetails) =>
  new AppError(code, 409, message, details)

export const unprocessable = (code: ErrorCode, message: string, details?: ErrorDetails) =>
  new AppError(code, 422, message, details)

/** Shape of a PostgREST/Postgres failure, as supabase-js surfaces it. */
export interface PostgresFailure {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

const UNIQUE_VIOLATION = '23505'
const CHECK_VIOLATION = '23514'
const FOREIGN_KEY_VIOLATION = '23503'

/**
 * Translate a Postgres failure into an AppError.
 *
 * The database, not this function, is the authority on capacity and name
 * uniqueness — a trigger and a unique index respectively. All we do here is put
 * a clean face on the rejection so the UI can say something specific.
 */
export function mapPostgresError(failure: PostgresFailure): AppError {
  const code = failure.code ?? ''
  const text = `${failure.message ?? ''} ${failure.details ?? ''}`.toLowerCase()

  if (code === UNIQUE_VIOLATION) {
    if (text.includes('players_room_name_key')) {
      return conflict('name_taken', 'That name is already taken in this room.')
    }
    if (text.includes('players_room_auth_key')) {
      return conflict('already_joined', 'You have already joined this room.')
    }
    if (text.includes('rooms_code_key')) {
      return conflict('code_unavailable', 'Could not allocate a room code. Try again.')
    }
    if (text.includes('puzzles_room_id_mode_number_key')) {
      return conflict('puzzle_not_found', 'That puzzle was created concurrently. Try again.')
    }
    if (text.includes('attempts_player_id_puzzle_id_key')) {
      return conflict('guess_in_flight', 'Another guess is already being scored. Try again.')
    }
  }

  if (code === CHECK_VIOLATION && text.includes('room is full')) {
    return conflict('room_full', 'This room is full.')
  }

  if (code === CHECK_VIOLATION && text.includes('names are locked')) {
    return forbidden('forbidden', 'Player names cannot be changed.')
  }

  if (code === FOREIGN_KEY_VIOLATION && text.includes('does not exist')) {
    return notFound('room_not_found', 'That room no longer exists.')
  }

  // Anything unrecognised is a bug on our side, not a message for the player.
  console.error('unmapped postgres failure', failure)
  return new AppError('internal', 500, 'Something went wrong. Try again.')
}
