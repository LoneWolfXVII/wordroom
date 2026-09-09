import type { Mark, MarkRow, Mode, Puzzle } from '@wordroom/shared'

/**
 * The game's view of the Edge Functions.
 *
 * The store talks to this interface, never to `fetch` or to Supabase directly,
 * for two reasons. Auth belongs to workstream 3, so the access token arrives as
 * a callback rather than as an import; and a test (or the `/dev/game` harness)
 * can stand in a double without a network or a database.
 *
 * Shapes come from supabase/functions/README.md.
 */

export interface GetPuzzleInput {
  roomId: string
  mode: Mode
  number: number
}

export interface SubmitGuessInput {
  puzzleId: string
  guess: string
  /** Time on the puzzle so far. Omitted when the timer is off. */
  elapsedMs?: number
}

export interface SubmitTimeoutInput {
  puzzleId: string
  elapsedMs?: number
}

/**
 * `GuessResultBody`, with the two answer-bearing fields renamed.
 *
 * The server sends the word only once the attempt is finished. It is called
 * `word` here so that the one line that reads it off the wire is the only place
 * in `apps/web` that names the field at all.
 */
export interface GuessResult {
  attemptId: string
  puzzleId: string
  /** One mark per letter, or null for a timeout — nothing was guessed. */
  marks: MarkRow | null
  guessCount: number
  guessesRemaining: number
  solved: boolean
  finished: boolean
  /** The puzzle's word. Non-null only once `finished` is true. */
  word: string | null
  points: number | null
  elapsedMs: number | null
}

export interface GameApi {
  getPuzzle(input: GetPuzzleInput): Promise<Puzzle>
  submitGuess(input: SubmitGuessInput): Promise<GuessResult>
  submitTimeout(input: SubmitTimeoutInput): Promise<GuessResult>
}

/** Stable error codes from `_shared/errors.ts` that the game reacts to by name. */
export type GameErrorCode =
  | 'not_a_word'
  | 'wrong_length'
  | 'hard_mode_violation'
  | 'attempt_finished'
  | 'guess_in_flight'
  | 'puzzle_not_found'
  | 'puzzle_out_of_sequence'
  | 'rate_limited'
  | 'unauthorized'
  | 'not_a_member'
  | 'bad_request'
  | 'internal'
  | 'offline'
  | (string & {})

export class GameApiError extends Error {
  readonly code: GameErrorCode
  readonly status: number
  readonly details: Record<string, unknown>

  constructor(code: GameErrorCode, message: string, status = 0, details = {}) {
    super(message)
    this.name = 'GameApiError'
    this.code = code
    this.status = status
    this.details = details
  }
}

export interface EdgeApiConfig {
  /** Base URL of the functions host, e.g. `https://<ref>.supabase.co/functions/v1`. */
  functionsUrl: string
  /**
   * Base URL of PostgREST, e.g. `https://<ref>.supabase.co/rest/v1`.
   *
   * A guess goes here rather than to an Edge Function, and the difference is
   * most of the wait. Measured from India against the deployed project: a POST
   * to a function that does not exist — nothing invoked, pure platform routing —
   * costs 528-676ms, while a PostgREST call doing real work costs 175-195ms. The
   * function was paying that toll and then making two round trips of its own.
   */
  restUrl: string
  /** The project's publishable anon key, sent as `apikey`. */
  anonKey: string
  /** Resolves the caller's Supabase access token. Workstream 3 owns where it comes from. */
  getAccessToken: () => Promise<string | null>
}

const MARKS: readonly string[] = ['correct', 'present', 'absent']

function asMarkRow(value: unknown): MarkRow | null {
  if (!Array.isArray(value)) return null
  const row: Mark[] = []
  for (const entry of value) {
    if (typeof entry !== 'string' || !MARKS.includes(entry)) {
      throw new GameApiError('internal', 'The server sent a result we could not read.')
    }
    row.push(entry as Mark)
  }
  return row
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readGuessResult(body: Record<string, unknown>): GuessResult {
  const finished = body.finished === true
  return {
    attemptId: asString(body.attemptId) ?? '',
    puzzleId: asString(body.puzzleId) ?? '',
    marks: asMarkRow(body.marks),
    guessCount: asNumber(body.guessCount) ?? 0,
    guessesRemaining: asNumber(body.guessesRemaining) ?? 0,
    solved: body.solved === true,
    finished,
    // The reveal path, and the only line in apps/web that names the field.
    // `submit-guess` sets it only once the attempt is solved, failed or timed
    // out — exactly when the player is allowed to see the word. It is renamed
    // to `word` here so nothing downstream can carry an `answer`.
    word: finished ? asString(body.answer) : null, // answers-ok: reveal path only
    points: asNumber(body.points),
    elapsedMs: asNumber(body.elapsedMs),
  }
}

function readPuzzle(body: Record<string, unknown>): Puzzle {
  const puzzle = body.puzzle
  if (typeof puzzle !== 'object' || puzzle === null) {
    throw new GameApiError('internal', 'The server sent a puzzle we could not read.')
  }
  const raw = puzzle as Record<string, unknown>
  const mode = asNumber(raw.mode)
  if (mode !== 5 && mode !== 6 && mode !== 7) {
    throw new GameApiError('internal', 'The server sent a puzzle we could not read.')
  }
  return {
    id: asString(raw.id) ?? '',
    roomId: asString(raw.roomId) ?? '',
    mode,
    number: asNumber(raw.number) ?? 1,
  }
}

/** Turn the `{ error: { code, message } }` envelope into a typed throw. */
function toError(status: number, body: unknown): GameApiError {
  const envelope =
    typeof body === 'object' && body !== null
      ? ((body as Record<string, unknown>).error as Record<string, unknown> | undefined)
      : undefined

  const code = asString(envelope?.code) ?? (status === 401 ? 'unauthorized' : 'internal')
  const message = asString(envelope?.message) ?? 'Something went wrong. Try again.'
  const details =
    typeof envelope?.details === 'object' && envelope.details !== null
      ? (envelope.details as Record<string, unknown>)
      : {}

  return new GameApiError(code, message, status, details)
}

/** The real transport: a POST per function, bearer token plus apikey. */
export function createEdgeGameApi(config: EdgeApiConfig): GameApi {
  async function call(name: string, payload: unknown): Promise<Record<string, unknown>> {
    const token = await config.getAccessToken()
    if (token === null) {
      throw new GameApiError('unauthorized', 'Sign-in expired. Reload to keep playing.', 401)
    }

    let response: Response
    try {
      response = await fetch(`${config.functionsUrl.replace(/\/$/, '')}/${name}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: config.anonKey,
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })
    } catch {
      throw new GameApiError('offline', 'No connection. Reconnect to play.')
    }

    const body: unknown = await response.json().catch(() => null)
    if (!response.ok) throw toError(response.status, body)
    if (typeof body !== 'object' || body === null) {
      throw new GameApiError('internal', 'The server sent an empty response.', response.status)
    }
    return body as Record<string, unknown>
  }

  /**
   * One round trip, straight to Postgres.
   *
   * `submit_guess` answers 200 either way and puts a rejection in the body, so
   * the envelope is checked here rather than the status: a raised exception
   * would lose the domain code the board needs to tell "not a word" from
   * "already over", and would roll back the rate-limit hit with it.
   */
  async function rpc(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const token = await config.getAccessToken()
    if (token === null) {
      throw new GameApiError('unauthorized', 'Sign-in expired. Reload to keep playing.', 401)
    }

    let response: Response
    try {
      response = await fetch(`${config.restUrl.replace(/\/$/, '')}/rpc/submit_guess`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: config.anonKey,
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })
    } catch {
      throw new GameApiError('offline', 'No connection. Reconnect to play.')
    }

    const body: unknown = await response.json().catch(() => null)
    if (!response.ok) throw toError(response.status, body)
    if (typeof body !== 'object' || body === null) {
      throw new GameApiError('internal', 'The server sent an empty response.', response.status)
    }
    const record = body as Record<string, unknown>
    if (record.error !== undefined) throw toError(200, record)
    return record
  }

  return {
    async getPuzzle(input) {
      return readPuzzle(await call('get-puzzle', input))
    },
    async submitGuess(input) {
      return readGuessResult(
        await rpc({
          p_puzzle_id: input.puzzleId,
          p_guess: input.guess,
          p_elapsed_ms: input.elapsedMs ?? null,
          p_timed_out: false,
        }),
      )
    },
    async submitTimeout(input) {
      return readGuessResult(
        await rpc({
          p_puzzle_id: input.puzzleId,
          p_guess: null,
          p_elapsed_ms: input.elapsedMs ?? null,
          p_timed_out: true,
        }),
      )
    },
  }
}

/**
 * The transport the store uses.
 *
 * Registered once at app start — by workstream 3's room screen with the real
 * one, by `/dev/game` with a local double. Left unset it throws rather than
 * silently doing nothing, because a board that eats guesses is worse than one
 * that says it is broken.
 */
let current: GameApi | null = null

export function setGameApi(api: GameApi | null): void {
  current = api
}

export function getGameApi(): GameApi {
  if (current === null) {
    throw new GameApiError('internal', 'The game is not connected yet. Reload the page.')
  }
  return current
}
