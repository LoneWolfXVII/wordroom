/**
 * The answer-free projection of `attempts`, for realtime payloads.
 *
 * A Postgres realtime payload carries whatever columns the subscribing role may
 * select, so `guesses` is already revoked from `authenticated` and should never
 * arrive — but `supabase/migrations/20260908000200_rls.sql` asks workstream 4 to
 * subscribe to the answer-free columns *explicitly* rather than rely on that.
 * The client API has no column projection, so "explicitly" is enforced here
 * instead: every record coming off the socket is filtered through the allowlist
 * below before a single field of it can reach React state.
 *
 * A solved attempt's last guess is the answer. That is the whole reason this
 * file exists.
 */

/** Exactly the column grant in `20260908000200_rls.sql`. Keep the two in step. */
export const ATTEMPT_PUBLIC_COLUMNS = [
  'id',
  'player_id',
  'puzzle_id',
  'marks',
  'solved',
  'guess_count',
  'elapsed_ms',
  'timer_mode',
  'hard_mode',
  'started_at',
  'finished_at',
] as const

export type AttemptPublicColumn = (typeof ATTEMPT_PUBLIC_COLUMNS)[number]

/**
 * The PostgREST `select` string for an answer-free read of `attempts`.
 * Never `*`: a `select *` on this table is one migration away from leaking.
 */
export const ATTEMPT_PUBLIC_SELECT = ATTEMPT_PUBLIC_COLUMNS.join(', ')

const ALLOWED = new Set<string>(ATTEMPT_PUBLIC_COLUMNS)

export type AnswerFreeAttempt = Partial<Record<AttemptPublicColumn, unknown>>

/**
 * Copy only the allowlisted columns out of a realtime record.
 *
 * Anything unrecognised — a future column, `guesses` if a grant is ever widened
 * by accident — is dropped rather than passed through, so the app cannot come to
 * depend on it and a leak cannot reach the DOM.
 */
export function narrowAttempt(record: unknown): AnswerFreeAttempt {
  if (record === null || typeof record !== 'object') return {}

  const narrowed: AnswerFreeAttempt = {}
  for (const [key, value] of Object.entries(record)) {
    if (ALLOWED.has(key)) narrowed[key as AttemptPublicColumn] = value
  }
  return narrowed
}

/** The keys a payload carried that the room is not allowed to see. */
export function forbiddenColumns(record: unknown): string[] {
  if (record === null || typeof record !== 'object') return []
  return Object.keys(record).filter((key) => !ALLOWED.has(key))
}
