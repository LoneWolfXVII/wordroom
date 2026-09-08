import { assert, assertEquals } from '@std/assert'
import { hitRateLimit, loadContext, persistAttempt } from '../_shared/guess-store.ts'

/**
 * The direct-Postgres path, against a real database.
 *
 * Skipped unless `SUPABASE_DB_URL` is set, because there is nothing to talk to
 * otherwise — CI has no database, and a test that silently passes without one
 * would be worse than no test. To run it:
 *
 *   docker run -d --name pg -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgres:17-alpine
 *   # apply supabase/migrations/*.sql and the two seeds, then
 *   SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:55432/postgres \
 *     deno test --allow-all _tests/direct-sql.test.ts
 *
 * The fixture it expects is in the header of `supabase/README.md`.
 */
const live = Boolean(Deno.env.get('SUPABASE_DB_URL'))

import { sql } from '../_shared/sql.ts'

/**
 * Its own room, player and puzzle per run, torn down afterwards. Sharing a
 * fixture across runs made these pass once and then fail: the attempt written by
 * the persist test was still there the next time, so `loadContext` no longer saw
 * a fresh board and the insert hit the unique constraint.
 */
const PUZZLE = crypto.randomUUID()
const USER = crypto.randomUUID()
const PLAYER = crypto.randomUUID()
const ROOM = crypto.randomUUID()
const CODE = 'TEST'

async function setUp() {
  await sql()`insert into auth.users (id) values (${USER}::uuid)`
  await sql()`
    insert into public.rooms (id, code, name, timezone)
    values (${ROOM}::uuid, ${CODE}, 'Direct SQL test', 'UTC')`
  await sql()`
    insert into public.players (id, room_id, auth_user_id, name)
    values (${PLAYER}::uuid, ${ROOM}::uuid, ${USER}::uuid, 'Ada')`
  await sql()`
    insert into public.puzzles (id, room_id, mode, number, answer)
    values (${PUZZLE}::uuid, ${ROOM}::uuid, 5, 1, 'crane')`
}

async function tearDown() {
  await sql()`delete from public.rooms where id = ${ROOM}::uuid`
  await sql()`delete from auth.users where id = ${USER}::uuid`
}

if (live) {
  await setUp()
  globalThis.addEventListener('unload', () => {
    void tearDown()
  })
}

Deno.test({
  name: 'loadContext returns puzzle, player and the dictionary verdict in one query',
  ignore: !live,
  async fn() {
    const ctx = await loadContext(PUZZLE, USER, 'slate')
    assert(ctx !== null)
    assertEquals(ctx.puzzle.answer, 'crane')
    assertEquals(ctx.player.name, 'Ada')
    assertEquals(ctx.attempt, null)
    assertEquals(ctx.guessIsWord, true)
  },
})

Deno.test({
  name: 'a non-word is rejected by guess_bank',
  ignore: !live,
  async fn() {
    const ctx = await loadContext(PUZZLE, USER, 'zzzzz')
    assertEquals(ctx?.guessIsWord, false)
  },
})

Deno.test({
  name: 'a timeout carries no guess, so no dictionary verdict',
  ignore: !live,
  async fn() {
    const ctx = await loadContext(PUZZLE, USER, undefined)
    assertEquals(ctx?.guessIsWord, null)
  },
})

Deno.test({
  name: 'a stranger gets no row, which is how not_a_member is decided',
  ignore: !live,
  async fn() {
    const ctx = await loadContext(PUZZLE, '22222222-2222-2222-2222-222222222222', 'slate')
    assertEquals(ctx, null)
  },
})

Deno.test({
  name: 'the rate limiter counts and eventually refuses',
  ignore: !live,
  async fn() {
    const key = `test:${crypto.randomUUID()}`
    for (let i = 0; i < 3; i++) {
      assertEquals((await hitRateLimit(key, 60, 3)).allowed, true)
    }
    assertEquals((await hitRateLimit(key, 60, 3)).allowed, false)
  },
})

Deno.test({
  name: 'persist inserts, then updates under the guess_count guard',
  ignore: !live,
  async fn() {
    const inserted = await persistAttempt({
      attempt: null,
      playerId: PLAYER,
      puzzleId: PUZZLE,
      guesses: ['slate'],
      marks: ['absent,absent,correct,absent,correct'],
      solved: false,
      guessCount: 1,
      elapsedMs: null,
      finishedAt: null,
      timerMode: 'off',
      hardMode: false,
    })
    assertEquals(inserted.guess_count, 1)

    const updated = await persistAttempt({
      attempt: inserted,
      playerId: PLAYER,
      puzzleId: PUZZLE,
      guesses: ['slate', 'crane'],
      marks: ['absent,absent,correct,absent,correct', 'correct,correct,correct,correct,correct'],
      solved: true,
      guessCount: 2,
      elapsedMs: 4200,
      finishedAt: new Date().toISOString(),
      timerMode: 'off',
      hardMode: false,
    })
    assertEquals(updated.guess_count, 2)
    assertEquals(updated.solved, true)

    // A second write from the stale row must lose, not overwrite.
    let conflicted = false
    try {
      await persistAttempt({
        attempt: inserted,
        playerId: PLAYER,
        puzzleId: PUZZLE,
        guesses: ['slate', 'about'],
        marks: ['aaaaa', 'bbbbb'],
        solved: false,
        guessCount: 2,
        elapsedMs: null,
        finishedAt: null,
        timerMode: 'off',
        hardMode: false,
      })
    } catch {
      conflicted = true
    }
    assert(conflicted, 'a stale write should conflict, not silently win')
  },
})
