/**
 * submit-guess — the security-critical one.
 *
 * POST { puzzleId, guess, elapsedMs? }        -> 200 GuessResultBody
 * POST { puzzleId, timedOut: true, elapsedMs? } -> 200 GuessResultBody (a fail)
 *
 * THE RULE: the response carries marks — 'correct' / 'present' / 'absent' per
 * tile — and nothing else, until the attempt is over. `answer` appears only
 * once `finished_at` is set: solved, out of guesses, or timed out. Every
 * unfinished body is checked against the answer before it is sent
 * (`assertAnswerAbsent`), so a future refactor fails loudly here instead of
 * quietly in someone's network tab.
 *
 * An invalid word is rejected and is NOT counted as a guess: nothing is written
 * at all, so the row is not consumed. Same for a hard-mode violation.
 *
 * Scoring and the hard-mode rules come from `@wordroom/shared` via
 * `_shared/guess-engine.ts`. They are not reimplemented here.
 */

import { requireCaller } from '../_shared/auth.ts'
import { loadContext, persistAttempt } from '../_shared/guess-store.ts'
import { hasDirectConnection } from '../_shared/sql.ts'
import {
  type AttemptRow,
  type PlayerRow,
  type PuzzleRow,
  readSettings,
  type ServiceClient,
  serviceClient,
} from '../_shared/db.ts'
import { conflict, forbidden, mapPostgresError, unprocessable } from '../_shared/errors.ts'
import {
  type AttemptState,
  emptyAttemptState,
  playGuess,
  timeOut,
} from '../_shared/guess-engine.ts'
import { jsonResponse, readJson, serveFunction } from '../_shared/http.ts'
import { decodeMarks, encodeMarks } from '../_shared/marks.ts'
import { guessResultBody } from '../_shared/presenters.ts'
import { enforceRateLimit, SUBMIT_GUESS_LIMIT } from '../_shared/rate-limit.ts'
import { submitGuessSchema } from '../_shared/schemas.ts'

const ATTEMPT_COLUMNS = '*'

function toState(attempt: AttemptRow): AttemptState {
  return {
    guesses: attempt.guesses,
    marks: decodeMarks(attempt.marks),
    solved: attempt.solved,
    finishedAt: attempt.finished_at,
    hardMode: attempt.hard_mode,
  }
}

/**
 * Play time is reported by the client, because the timer is a per-player
 * setting that can be paused between sessions. It only ever breaks ties on the
 * leaderboard — it never adds points — so a wrong value cannot buy a rank on
 * its own. It is held monotonic so a later guess cannot lower it.
 */
function resolveElapsed(
  attempt: AttemptRow | null,
  reported: number | undefined,
  now: Date,
): number | null {
  const previous = attempt?.elapsed_ms ?? null

  if (reported !== undefined) return Math.max(reported, previous ?? 0)
  if (!attempt) return null

  const sinceStart = now.getTime() - new Date(attempt.started_at).getTime()
  return Math.max(Number.isFinite(sinceStart) ? Math.max(sinceStart, 0) : 0, previous ?? 0)
}

interface PersistInput {
  db: ServiceClient
  attempt: AttemptRow | null
  playerId: string
  puzzleId: string
  next: AttemptState
  elapsedMs: number | null
  timerMode: string
  hardMode: boolean
}

/**
 * Write the attempt.
 *
 * Two guesses racing on the same attempt would otherwise both read guess_count
 * = 2 and both write 3, losing one. The update is conditional on the count and
 * on the attempt still being open, so the loser writes nothing and is told to
 * retry rather than silently overwriting.
 */
async function persist(input: PersistInput): Promise<AttemptRow> {
  if (hasDirectConnection()) {
    return await persistAttempt({
      attempt: input.attempt,
      playerId: input.playerId,
      puzzleId: input.puzzleId,
      guesses: input.next.guesses,
      marks: encodeMarks(input.next.marks),
      solved: input.next.solved,
      guessCount: input.next.guesses.length,
      elapsedMs: input.elapsedMs,
      finishedAt: input.next.finishedAt,
      timerMode: input.timerMode,
      hardMode: input.hardMode,
    })
  }

  const { db, attempt, next } = input
  const row = {
    guesses: next.guesses,
    marks: encodeMarks(next.marks),
    solved: next.solved,
    guess_count: next.guesses.length,
    elapsed_ms: input.elapsedMs,
    finished_at: next.finishedAt,
  }

  if (!attempt) {
    const { data, error } = await db
      .from('attempts')
      .insert({
        ...row,
        player_id: input.playerId,
        puzzle_id: input.puzzleId,
        timer_mode: input.timerMode,
        hard_mode: input.hardMode,
      })
      .select(ATTEMPT_COLUMNS)
      .single()

    if (error) throw mapPostgresError(error)
    return data as AttemptRow
  }

  const { data, error } = await db
    .from('attempts')
    .update(row)
    .eq('id', attempt.id)
    .eq('guess_count', attempt.guess_count)
    .is('finished_at', null)
    .select(ATTEMPT_COLUMNS)
    .maybeSingle()

  if (error) throw mapPostgresError(error)
  if (!data) {
    throw conflict('guess_in_flight', 'That guess crossed with another. Try again.')
  }
  return data as AttemptRow
}

/**
 * Puzzle, the caller's player row and their attempt — in one round trip.
 *
 * `guess_context` does the join in Postgres. No row means either the puzzle does
 * not exist or the caller is not in its room, and the two are deliberately the
 * same answer: a stranger should not be able to probe which puzzle ids exist.
 */
interface GuessContext {
  puzzle: PuzzleRow
  player: PlayerRow
  attempt: AttemptRow | null
  /** Null when the request carried no guess, i.e. a timeout. */
  guess_is_word: boolean | null
}

async function loadGuessContext(
  db: ServiceClient,
  puzzleId: string,
  userId: string,
  guess: string | undefined,
): Promise<GuessContext> {
  // Straight to Postgres where the platform offers a connection. supabase-js
  // reaches the database through the *public* HTTPS endpoint, so each query
  // leaves the region and comes back — that round trip, not the query, is most
  // of this function's time. Same SQL either way; see `_shared/guess-store.ts`.
  if (hasDirectConnection()) {
    const direct = await loadContext(puzzleId, userId, guess)
    if (!direct) throw forbidden('not_a_member', 'You are not a player in this room.')
    return {
      puzzle: direct.puzzle,
      player: direct.player,
      attempt: direct.attempt,
      guess_is_word: direct.guessIsWord,
    }
  }

  const { data, error } = await db
    .rpc('guess_context', { p_puzzle_id: puzzleId, p_user_id: userId, p_guess: guess ?? null })
    .maybeSingle()

  if (error) throw mapPostgresError(error)
  if (!data) throw forbidden('not_a_member', 'You are not a player in this room.')

  return data as GuessContext
}

serveFunction(async (req) => {
  // Local signature check — no round trip. See `_shared/jwt.ts`.
  const caller = await requireCaller(req)
  const db = serviceClient()
  const body = await readJson(req, submitGuessSchema)

  // The rate limiter and the context read need nothing from each other, so they
  // go together rather than one after the other. This function used to be six
  // sequential round trips and a guess took about two seconds; the three reads
  // that could be one query now are, and the two that remain overlap.
  const [, context] = await Promise.all([
    enforceRateLimit(db, 'submit-guess', caller.userId, SUBMIT_GUESS_LIMIT),
    loadGuessContext(db, body.puzzleId, caller.userId, body.guess),
  ])

  const { puzzle, player, attempt } = context
  const settings = readSettings(player)
  const now = new Date()
  const nowIso = now.toISOString()

  // Hard mode and the timer are snapshotted onto the attempt when it is opened,
  // so changing a setting mid-puzzle cannot change the rules of a puzzle in
  // play. Settings apply from the next puzzle, per the spec.
  const state = attempt ? toState(attempt) : emptyAttemptState(settings.hardMode)
  const elapsedMs = resolveElapsed(attempt, body.elapsedMs, now)

  if (body.timedOut === true) {
    // Already over: answer the same way twice rather than erroring, so a retry
    // after a dropped connection still gets the player their result.
    if (attempt && attempt.finished_at !== null) {
      return jsonResponse(
        req,
        guessResultBody({
          attemptId: attempt.id,
          puzzleId: puzzle.id,
          marks: null,
          guessCount: attempt.guess_count,
          solved: attempt.solved,
          finishedAt: attempt.finished_at,
          elapsedMs: attempt.elapsed_ms,
          answer: puzzle.answer,
        }),
      )
    }

    const finished = await persist({
      db,
      attempt,
      playerId: player.id,
      puzzleId: puzzle.id,
      next: timeOut(state, nowIso),
      elapsedMs,
      timerMode: settings.timerMode,
      hardMode: settings.hardMode,
    })

    return jsonResponse(
      req,
      guessResultBody({
        attemptId: finished.id,
        puzzleId: puzzle.id,
        marks: null,
        guessCount: finished.guess_count,
        solved: finished.solved,
        finishedAt: finished.finished_at,
        elapsedMs: finished.elapsed_ms,
        answer: puzzle.answer,
      }),
    )
  }

  const outcome = playGuess({
    answer: puzzle.answer,
    mode: puzzle.mode,
    guess: body.guess,
    state,
    isRealWord: context.guess_is_word !== false,
    now: nowIso,
  })

  if (outcome.kind === 'rejected') {
    // Nothing has been written. The guess did not happen.
    if (outcome.code === 'attempt_finished') {
      throw conflict(outcome.code, outcome.message, outcome.details)
    }
    throw unprocessable(outcome.code, outcome.message, outcome.details)
  }

  const saved = await persist({
    db,
    attempt,
    playerId: player.id,
    puzzleId: puzzle.id,
    next: outcome.next,
    elapsedMs,
    timerMode: settings.timerMode,
    hardMode: settings.hardMode,
  })

  return jsonResponse(
    req,
    guessResultBody({
      attemptId: saved.id,
      puzzleId: puzzle.id,
      marks: outcome.marks,
      guessCount: saved.guess_count,
      solved: saved.solved,
      finishedAt: saved.finished_at,
      elapsedMs: saved.elapsed_ms,
      answer: puzzle.answer,
    }),
  )
})
