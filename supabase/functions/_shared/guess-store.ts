import type { AttemptRow, PlayerRow, PuzzleRow } from './db.ts'
import { conflict } from './errors.ts'
import { sql } from './sql.ts'

/**
 * `submit-guess`'s database work, over a direct Postgres connection.
 *
 * The same three operations the function always made — rate limit, context read,
 * attempt write — but as SQL rather than three HTTPS calls to the public
 * PostgREST endpoint. See `sql.ts` for why that endpoint was the cost.
 *
 * The SQL is deliberately the same as what the RPCs run, so behaviour does not
 * change: `guess_context` is inlined here rather than reimplemented, and the
 * conditional update keeps the `guess_count` guard that makes two simultaneous
 * guesses resolve to one winner.
 */

export interface GuessContext {
  puzzle: PuzzleRow
  player: PlayerRow
  attempt: AttemptRow | null
  /** Null when the request carried no guess, i.e. a timeout. */
  guessIsWord: boolean | null
}

export async function loadContext(
  puzzleId: string,
  userId: string,
  guess: string | undefined,
): Promise<GuessContext | null> {
  const rows = await sql()<
    {
      puzzle: PuzzleRow
      player: PlayerRow
      attempt: AttemptRow | null
      guess_is_word: boolean | null
    }[]
  >`
    select
      to_jsonb(pz) as puzzle,
      to_jsonb(pl) as player,
      case when a.id is null then null else to_jsonb(a) end as attempt,
      case
        when ${guess ?? null}::text is null then null
        else exists (
          select 1 from public.guess_bank g
           where g.len = pz.mode and g.word = lower(btrim(${guess ?? null}::text))
        )
      end as guess_is_word
    from public.puzzles pz
    join public.players pl
      on pl.room_id = pz.room_id
     and pl.auth_user_id = ${userId}::uuid
    left join public.attempts a
      on a.puzzle_id = pz.id
     and a.player_id = pl.id
    where pz.id = ${puzzleId}::uuid
  `

  const row = rows[0]
  if (!row) return null

  return {
    puzzle: row.puzzle,
    player: row.player,
    attempt: row.attempt,
    guessIsWord: row.guess_is_word,
  }
}

/** The same counter `rate_limit_hit` keeps, called directly. */
export async function hitRateLimit(
  key: string,
  windowSeconds: number,
  maxHits: number,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const rows = await sql()<{ allowed: boolean; retry_after_seconds: number }[]>`
    select * from public.rate_limit_hit(${key}, ${windowSeconds}, ${maxHits})
  `
  const row = rows[0]
  // A limiter that cannot answer must not take the game down: fail open, which
  // is what the supabase-js path did too.
  return {
    allowed: row?.allowed ?? true,
    retryAfterSeconds: row?.retry_after_seconds ?? 1,
  }
}

export interface PersistInput {
  attempt: AttemptRow | null
  playerId: string
  puzzleId: string
  guesses: string[]
  marks: string[]
  solved: boolean
  guessCount: number
  elapsedMs: number | null
  finishedAt: string | null
  timerMode: string
  hardMode: boolean
}

export async function persistAttempt(input: PersistInput): Promise<AttemptRow> {
  if (!input.attempt) {
    const rows = await sql()<AttemptRow[]>`
      insert into public.attempts
        (player_id, puzzle_id, guesses, marks, solved, guess_count,
         elapsed_ms, finished_at, timer_mode, hard_mode)
      values
        (${input.playerId}::uuid, ${input.puzzleId}::uuid, ${input.guesses},
         ${input.marks}, ${input.solved}, ${input.guessCount},
         ${input.elapsedMs}, ${input.finishedAt}::timestamptz,
         ${input.timerMode}, ${input.hardMode})
      returning *
    `
    const row = rows[0]
    if (!row) throw conflict('guess_in_flight', 'That guess crossed with another. Try again.')
    return row
  }

  // `guess_count` in the predicate is the optimistic lock: if another request
  // wrote first, this matches nothing and that player is told to retry rather
  // than silently overwriting the row.
  const rows = await sql()<AttemptRow[]>`
    update public.attempts
       set guesses     = ${input.guesses},
           marks       = ${input.marks},
           solved      = ${input.solved},
           guess_count = ${input.guessCount},
           elapsed_ms  = ${input.elapsedMs},
           finished_at = ${input.finishedAt}::timestamptz
     where id          = ${input.attempt.id}::uuid
       and guess_count = ${input.attempt.guess_count}
       and finished_at is null
    returning *
  `
  const row = rows[0]
  if (!row) throw conflict('guess_in_flight', 'That guess crossed with another. Try again.')
  return row
}
