import { requireSupabaseEnv } from './env'

/**
 * Out-of-band access to the same backend the browser talks to.
 *
 * Two jobs:
 *
 *  1. Set a test up cheaply — create a room, seat a second player — without
 *     driving three browser contexts through the UI for every assertion.
 *  2. Learn a puzzle's answer *legitimately*, by finishing an attempt as a
 *     throwaway player. That is the only way a client is ever given an answer,
 *     so the security spec can assert against a known string instead of a
 *     guess, without a service-role key anywhere near the test runner.
 */

export interface Room {
  id: string
  code: string
  name: string
  hostPlayerId: string
  maxPlayers: number
  timezone: string
  createdAt: string
  archivedAt: string | null
}

export interface Player {
  id: string
  roomId: string
  authUserId: string
  name: string
}

export interface Puzzle {
  id: string
  roomId: string
  mode: number
  number: number
}

export interface GuessResult {
  attemptId: string
  puzzleId: string
  marks: string[] | null
  guessCount: number
  guessesRemaining: number
  solved: boolean
  finished: boolean
  answer?: string
  points?: number
}

interface ErrorBody {
  error?: { code?: string; message?: string }
}

export class EdgeError extends Error {
  constructor(
    readonly fn: string,
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(`${fn} failed (${status} ${code}): ${message}`)
    this.name = 'EdgeError'
  }
}

/**
 * A throwaway Supabase account. The app signs in anonymously on first load and
 * so does this; the suite is exercising the same auth path a player uses.
 *
 * Anonymous sign-ins are rate limited per IP on a real project, so users are
 * shared as widely as a test allows — see the `probe` worker fixture.
 */
export class ApiUser {
  private constructor(
    readonly accessToken: string,
    readonly userId: string,
  ) {}

  static async signUp(): Promise<ApiUser> {
    const env = requireSupabaseEnv()
    const res = await fetch(`${env.url}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: env.anonKey, 'content-type': 'application/json' },
      body: '{}',
    })
    const body = (await res.json()) as { access_token?: string; user?: { id?: string } }
    if (!body.access_token) {
      throw new Error(
        `Anonymous sign-up failed (${res.status}). If this says "rate limit", the ` +
          "project's anonymous sign-in budget for this IP is spent — wait an hour. " +
          JSON.stringify(body).slice(0, 300),
      )
    }
    return new ApiUser(body.access_token, body.user?.id ?? '')
  }

  async call<T>(fn: string, body: unknown): Promise<T> {
    const env = requireSupabaseEnv()
    const res = await fetch(`${env.url}/functions/v1/${fn}`, {
      method: 'POST',
      headers: {
        apikey: env.anonKey,
        authorization: `Bearer ${this.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const parsed = (await res.json()) as T & ErrorBody
    if (!res.ok) {
      throw new EdgeError(
        fn,
        res.status,
        parsed.error?.code ?? 'unknown',
        parsed.error?.message ?? 'no message',
      )
    }
    return parsed
  }

  createRoom(roomName: string, playerName: string): Promise<{ room: Room; player: Player }> {
    return this.call('create-room', { roomName, playerName, timezone: 'UTC' })
  }

  joinRoom(code: string, playerName: string): Promise<{ room: Room; player: Player }> {
    return this.call('join-room', { code, playerName })
  }

  async getPuzzle(roomId: string, mode: number, number: number): Promise<Puzzle> {
    const { puzzle } = await this.call<{ puzzle: Puzzle }>('get-puzzle', { roomId, mode, number })
    return puzzle
  }

  submitGuess(puzzleId: string, guess: string): Promise<GuessResult> {
    return this.call('submit-guess', { puzzleId, guess })
  }
}

/**
 * Real five-letter words drawn from opposite corners of the alphabet, so a
 * ladder of six is very unlikely to solve by accident — and harmless if it
 * does, because a solve unlocks the answer just as a fail does.
 */
export const GUESS_POOL = [
  'crane',
  'pilot',
  'mushy',
  'vodka',
  'jelly',
  'fudge',
  'wharf',
  'blitz',
  'quirk',
  'gnome',
] as const

/** Six words from the pool that are guaranteed not to be `answer`. */
export function losingLadder(answer: string): string[] {
  return GUESS_POOL.filter((word) => word !== answer.toLowerCase()).slice(0, 6)
}

/**
 * Play a puzzle to the end as `user` and return the answer the server hands
 * back on the finishing guess.
 *
 * This is the sanctioned route to an answer: `submit-guess` releases it only
 * once the attempt is finished. Nothing here reads the database.
 */
export async function discoverAnswer(user: ApiUser, puzzleId: string): Promise<string> {
  for (const guess of GUESS_POOL) {
    const result = await user.submitGuess(puzzleId, guess)
    if (result.finished) {
      if (!result.answer) {
        throw new Error('submit-guess reported finished but returned no answer')
      }
      return result.answer.toLowerCase()
    }
  }
  throw new Error(`Ran out of guesses without finishing puzzle ${puzzleId}`)
}
