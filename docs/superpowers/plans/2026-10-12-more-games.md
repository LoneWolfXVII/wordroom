# More games Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Release the 6- and 7-letter modes, and add Four at once (four 5-letter words, 9 guesses) as a fourth mode.

**Architecture:** Four is mode `4` in the existing integer `mode` columns. A Four game is four `puzzles` rows (`board` 1–4) with one `attempts` row per board, so answer secrecy, marks, realtime and RLS are reused unchanged. Two new SQL RPCs (`get_four`, `submit_four_guess`) follow the `get_puzzle`/`submit_guess` pattern. The existing sequence function `puzzle_index(seed, mode, number, count)` already hashes the mode, so Four uses `puzzle_index(seed, 4, 4(N−1)+b, count_of_5_letter_bank)`, an independent shuffle with no new derivation code. The client gets a separate `features/four` store and screen; the route renders it when mode is 4.

**Tech Stack:** Postgres/PL/pgSQL (Supabase), Next.js 15 App Router, React, Zustand, Vitest, Playwright, Biome.

**Spec:** `docs/superpowers/specs/2026-10-12-more-games-design.md`

**Spec amendment (found while planning):** the spec said the Four shuffle is keyed by `seed + ':four'`. `puzzle_index` already includes the mode in its digest (`seed|mode|epoch:n`), so passing mode `4` gives the same independence with zero new sequence code. Use that.

## Global Constraints

- Never write "Wordle" in product copy, page titles or share text.
- Answers never reach the client: no `answer` column grant changes; the only answer-bearing fields leave SQL when a board/game is finished; CI greps `.answer` in `apps/web` (mark genuine reveal lines `// answers-ok: <why>`).
- `revoke ... from public` is not enough — always also `from anon` (and `authenticated` where clients must not call).
- Scoring: modes 5–7 unchanged (`7 − n`). Four: per board `10 − n` (n = guess that solved it), 0 unsolved; best 30.
- A Four game counts as solved for stats/streaks only if all four boards are solved.
- Guess caps: 6 for modes 5–7, 9 for Four.
- Hard mode and timers are not offered in Four; elapsed is recorded for tie-breaks only.
- Game screen must fit 375×667 with no vertical scroll, including 7 letters and Four.
- Biome: single quotes, no semicolons, 100 columns. TS strict with `noUncheckedIndexedAccess`.
- Tests run against the local Supabase stack only. Migrations are not applied to production by this branch; PR says so; apply before merge.
- `apps/web/package.json` version must be bumped (CI `version` check).

## Review Focus

1. **Calling `submit_guess` with a Four board's puzzle id** — must be refused (`wrong_mode`); otherwise a player bypasses the 9-guess shared-row rule and reveals a board's answer in 6 guesses. Test in Task 3.
2. **`get_puzzle` with mode 4** — must be refused; Four is fetched only through `get_four`. Test in Task 3.
3. **Jumping ahead in Four** (`get_four` for N far beyond the room) — same out-of-sequence rule as other modes. Test in Task 3.
4. **Two tabs submitting Four guesses at once** — must not double-count a guess; per-game advisory lock. Test in Task 3 (sequential double-submit after end is rejected; lock is code-reviewed).
5. **A 7-letter row at 375px** — tiles must shrink to fit; checked by Playwright at 375×667 in Task 1.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/shared/src/types.ts` | `Mode` gains `4`; `MODES`, `WORD_MODES`, `FOUR`, `wordLength`, `maxGuesses` |
| `packages/shared/src/points.ts` | `fourBoardPoints`, `fourGamePoints` |
| `supabase/migrations/20261012000100_four_at_once.sql` | board column, constraints, guards, `get_four`, `submit_four_guess`, `four_games`, leaderboard views |
| `supabase/tests/four.test.sql` | SQL behaviour test |
| `supabase/scripts/verify-sql-parity.mts` | covers mode 4 positions |
| `apps/web/features/game/api.ts` | `getFour`, `submitFourGuess` |
| `apps/web/features/four/store.ts` (+ test) | Four game state machine |
| `apps/web/features/four/components/*` | `FourScreen`, `MiniBoard`, `QuadKeyboard` |
| `apps/web/features/four/share.ts` (+ test) | spoiler-free share text |
| `apps/web/features/game-route/index.tsx` | show switcher; render Four when mode is 4 |
| `apps/web/features/leaderboard/*` | Four rows, chips, stats |
| `e2e/four.spec.ts`, `e2e/modes.spec.ts` | end-to-end |

---

### Task 1: Release 6 and 7 letters

**Files:**
- Modify: `apps/web/features/game-route/index.tsx` (remove `showModes={false}` and its comment)
- Modify: `apps/web/features/game/components/game-screen.tsx` (drop the "hide until they ship" doc line)
- Create: `e2e/modes.spec.ts`
- Modify: `docs/wordroom-spec-v1.md` (move "6- and 7-letter modes" out of P1)

- [ ] **Step 1: Write the e2e test**

```ts
import { createRoom, startPlaying, uniqueName, waitForPlayable, warmRoutes } from './support/app'
import { expect, requiresSupabase, test, testRoomName } from './support/fixtures'

requiresSupabase()

test('switching to 7 letters gives a 7-wide board that fits the screen', async ({ page }) => {
  await warmRoutes(page)
  await createRoom(page, testRoomName('modes'), uniqueName('Host'))
  await startPlaying(page)
  await waitForPlayable(page)

  await page.getByRole('radio', { name: '7' }).click()
  await waitForPlayable(page)

  const firstRow = page.getByRole('row').first()
  await expect(firstRow.getByRole('gridcell')).toHaveCount(7)
  const box = await firstRow.boundingBox()
  const viewport = page.viewportSize()
  expect(box && viewport && box.x >= 0 && box.x + box.width <= viewport.width).toBe(true)
  // No vertical scroll at 375x667.
  const scrolls = await page.evaluate(
    () => document.documentElement.scrollHeight > window.innerHeight,
  )
  expect(scrolls).toBe(false)
})
```

(Check the board's actual roles in `components/board.tsx` first and use them; adjust `row`/`gridcell` to what it renders.)

- [ ] **Step 2: Run, expect FAIL** (switcher hidden): `pnpm exec playwright test e2e/modes.spec.ts`
- [ ] **Step 3: Show the switcher** — delete `showModes={false}` in `game-route/index.tsx`.
- [ ] **Step 4: Run, expect PASS.** If the 7-letter row overflows, size tiles from the mode in `board.module.css` (e.g. `--size-tile: min(56px, calc((100vw - 32px - (var(--len) - 1) * var(--size-gap)) / var(--len)))` with `--len` set inline by `Board`).
- [ ] **Step 5: Leaderboard follows mode** — open the leaderboard after switching; assert its description reads `7 letters`. Add to the same test.
- [ ] **Step 6: Commit** `git commit -m "Release the 6- and 7-letter modes"`

---

### Task 2: Shared — mode 4, word length, Four points

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/points.ts`
- Test: `packages/shared/src/points.test.ts`, `packages/shared/src/types.test.ts` (create)

**Interfaces — Produces:**
```ts
export type WordMode = 5 | 6 | 7
export type Mode = WordMode | 4
export const FOUR = 4
export const FOUR_BOARDS = 4
export const FOUR_MAX_GUESSES = 9
export const MODES: readonly Mode[]            // [5, 6, 7, 4] — switcher order
export function wordLength(mode: Mode): WordMode // 4 -> 5
export function maxGuesses(mode: Mode): number   // 4 -> 9, else 6
export function fourBoardPoints(solvedAt: number | null): number // 10 - n, 0 if null/out of range
export function fourGamePoints(solvedAt: readonly (number | null)[]): number
```

- [ ] **Step 1: Failing tests**

```ts
// types.test.ts
import { describe, expect, it } from 'vitest'
import { FOUR, maxGuesses, MODES, wordLength } from './types.js'

describe('modes', () => {
  it('Four plays 5-letter words with 9 guesses', () => {
    expect(wordLength(FOUR)).toBe(5)
    expect(maxGuesses(FOUR)).toBe(9)
  })
  it('word modes are their own length with 6 guesses', () => {
    for (const mode of [5, 6, 7] as const) {
      expect(wordLength(mode)).toBe(mode)
      expect(maxGuesses(mode)).toBe(6)
    }
  })
  it('lists Four last in the switcher', () => {
    expect(MODES).toEqual([5, 6, 7, 4])
  })
})
```

```ts
// append to points.test.ts
import { fourBoardPoints, fourGamePoints } from './points.js'

describe('Four points', () => {
  it('scores 10 - n per solved board, 0 unsolved', () => {
    expect(fourBoardPoints(1)).toBe(9)
    expect(fourBoardPoints(9)).toBe(1)
    expect(fourBoardPoints(null)).toBe(0)
    expect(fourBoardPoints(10)).toBe(0)
    expect(fourBoardPoints(0)).toBe(0)
  })
  it('sums a game; best possible is 30', () => {
    expect(fourGamePoints([1, 2, 3, 4])).toBe(30)
    expect(fourGamePoints([4, 6, 8, null])).toBe(6 + 4 + 2)
  })
})
```

- [ ] **Step 2: Run `pnpm --filter @wordroom/shared test`, expect FAIL.**
- [ ] **Step 3: Implement** in `types.ts` (replace the `Mode`/`MODES`/`MAX_GUESSES` block):

```ts
/** Word length of a single-board mode. */
export type WordMode = 5 | 6 | 7

/**
 * A mode: a word length, or Four at once (four 5-letter boards). Each mode has
 * its own puzzle sequence and its own leaderboard.
 */
export type Mode = WordMode | 4

export const FOUR = 4 as const
export const FOUR_BOARDS = 4
export const FOUR_MAX_GUESSES = 9

/** Switcher order. */
export const MODES: readonly Mode[] = [5, 6, 7, 4] as const

/** Guesses allowed per puzzle in a single-board mode. */
export const MAX_GUESSES = 6

export function wordLength(mode: Mode): WordMode {
  return mode === FOUR ? 5 : mode
}

export function maxGuesses(mode: Mode): number {
  return mode === FOUR ? FOUR_MAX_GUESSES : MAX_GUESSES
}
```

and in `points.ts`:

```ts
import { FOUR_MAX_GUESSES } from './types.js'

/**
 * One Four board: solved on guess `n` is worth `10 - n`; unsolved is 0.
 * Mirrored in SQL by `four_games`; change both together.
 */
export function fourBoardPoints(solvedAt: number | null): number {
  if (solvedAt === null || !Number.isInteger(solvedAt)) return 0
  if (solvedAt < 1 || solvedAt > FOUR_MAX_GUESSES) return 0
  return FOUR_MAX_GUESSES + 1 - solvedAt
}

export function fourGamePoints(solvedAt: readonly (number | null)[]): number {
  return solvedAt.reduce<number>((sum, n) => sum + fourBoardPoints(n), 0)
}
```

- [ ] **Step 4: Run tests, expect PASS. Run `pnpm typecheck`** and fix every exhaustive `Record<Mode, …>` / `mode === 5 | 6 | 7` site the new member breaks (e.g. `numbers: { 5: 1, 6: 1, 7: 1 }` in `features/game/store.ts` gains `4: 1`; `readMode` in `leaderboard/supabase-source.ts` accepts 4; `readPuzzle` in `game/api.ts` keeps rejecting 4 because `get_puzzle` never returns it). Where a single-board component takes a mode, narrow its prop to `WordMode`.
- [ ] **Step 5: Commit** `git commit -m "Shared: mode 4, word length, Four points"`

---

### Task 3: Database — Four at once

**Files:**
- Create: `supabase/migrations/20261012000100_four_at_once.sql`
- Create: `supabase/tests/four.test.sql`
- Modify: `.github/workflows/ci.yml` (run the test in `sql parity`)

**Interfaces — Produces (RPC contracts):**

`get_four(p_room_id uuid, p_number int) returns jsonb`
→ `{ "game": { "roomId", "number", "boards": [ { "board": 1..4, "puzzleId", "attemptId"|null, "marks": string[] (encoded rows), "guessCount", "solved", "word": string|null } ], "guesses": string[], "finished": bool, "points": int|null } }`
`guesses` are the caller's own words (from board 1's attempt — every board shares the same guess list up to its solve; take the longest). `word` is set only for a solved board or once the game is finished.

`submit_four_guess(p_room_id uuid, p_number int, p_guess text, p_elapsed_ms int default null) returns jsonb`
→ same `game` shape after the guess, plus `"marks": { "<board>": "c,p,a,…" }` for the boards this guess was scored on. Errors in-body like `submit_guess`: `unauthorized`, `rate_limited`, `not_a_member`, `puzzle_out_of_sequence`, `wrong_length`, `not_a_word`, `attempt_finished`, `internal`.

- [ ] **Step 1: Write the failing SQL test** `supabase/tests/four.test.sql`:

```sql
-- Four at once, end to end, in one rolled-back transaction.
-- Run: psql "$DB_URL" -v ON_ERROR_STOP=1 -qtA -f supabase/tests/four.test.sql
begin;

insert into auth.users (id, is_anonymous) values
  ('00000000-0000-0000-0000-0000000000f1', true),
  ('00000000-0000-0000-0000-0000000000f2', true);
insert into public.rooms (id, code, name, seed) values
  ('10000000-0000-0000-0000-0000000000f1', 'FOUR', 'Four', 'test-seed');
insert into public.players (id, room_id, auth_user_id, name) values
  ('30000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-0000000000f1',
   '00000000-0000-0000-0000-0000000000f1', 'Ana');

create temp table g (game jsonb);
grant all on g to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f1"}';

-- get_puzzle refuses mode 4; get_four materialises four distinct boards.
do $$ begin
  assert public.get_puzzle('10000000-0000-0000-0000-0000000000f1', 4, 1) ? 'error',
    'get_puzzle must refuse Four';
  assert public.get_four('10000000-0000-0000-0000-0000000000f1', 3) -> 'error' ->> 'code'
    = 'puzzle_out_of_sequence', 'cannot jump ahead';
end $$;
insert into g select public.get_four('10000000-0000-0000-0000-0000000000f1', 1);
do $$ begin
  assert jsonb_array_length((select game from g) -> 'game' -> 'boards') = 4, 'four boards';
  assert (select count(*) from g, jsonb_array_elements(game -> 'game' -> 'boards') b
           where b ->> 'word' is not null) = 0, 'no board word before it is solved';
end $$;

reset role;
-- The answers, read as the owner, to drive the test.
create temp table ans as
  select board, answer from public.puzzles
   where room_id = '10000000-0000-0000-0000-0000000000f1' and mode = 4 and number = 1;
grant select on ans to authenticated;
do $$ begin
  assert (select count(distinct answer) from ans) = 4, 'four different words';
end $$;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f1"}';

-- submit_guess refuses a Four board.
do $$ begin
  assert public.submit_guess((select (b ->> 'puzzleId')::uuid
      from g, jsonb_array_elements(game -> 'game' -> 'boards') b where (b ->> 'board') = '1'),
    'crane') -> 'error' ->> 'code' = 'wrong_mode', 'submit_guess must refuse Four boards';
end $$;

-- An invalid word costs nothing.
do $$ declare r jsonb; begin
  r := public.submit_four_guess('10000000-0000-0000-0000-0000000000f1', 1, 'zzzzz');
  assert r -> 'error' ->> 'code' = 'not_a_word', 'invalid word refused';
end $$;

-- Solve board 2 on guess 1: it locks and reveals only its own word.
do $$ declare r jsonb; begin
  r := public.submit_four_guess('10000000-0000-0000-0000-0000000000f1', 1,
         (select answer from ans where board = 2));
  assert (select (b ->> 'solved')::boolean from jsonb_array_elements(r -> 'game' -> 'boards') b
           where b ->> 'board' = '2'), 'board 2 solved';
  assert (select count(*) from jsonb_array_elements(r -> 'game' -> 'boards') b
           where b ->> 'word' is not null) = 1, 'only the solved board shows its word';
  assert jsonb_typeof(r -> 'marks' -> '1') = 'string', 'marks for an unsolved board';
end $$;

-- Burn the remaining 8 guesses on one valid non-answer word.
do $$ declare r jsonb; w text; i int; begin
  select word into w from public.guess_bank
   where len = 5 and word not in (select answer from ans) limit 1;
  for i in 1..8 loop
    r := public.submit_four_guess('10000000-0000-0000-0000-0000000000f1', 1, w);
  end loop;
  assert (r -> 'game' ->> 'finished')::boolean, 'game ends after 9 guesses';
  assert (r -> 'game' ->> 'points')::int = 9, 'one board solved on guess 1 = 9 points';
  assert (select count(*) from jsonb_array_elements(r -> 'game' -> 'boards') b
           where b ->> 'word' is not null) = 4, 'every word revealed at the end';
  assert public.submit_four_guess('10000000-0000-0000-0000-0000000000f1', 1, w)
    -> 'error' ->> 'code' = 'attempt_finished', 'no guess after the end';
end $$;

-- A non-member gets nothing.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f2"}';
do $$ begin
  assert public.get_four('10000000-0000-0000-0000-0000000000f1', 1) -> 'error' ->> 'code'
    = 'not_a_member', 'non-member refused';
end $$;

-- The stats view sees one game, not four boards.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f1"}';
do $$ begin
  assert (select count(*) from public.four_games
           where player_id = '30000000-0000-0000-0000-0000000000f1') = 1, 'one game row';
  assert (select points from public.four_games
           where player_id = '30000000-0000-0000-0000-0000000000f1') = 9, 'game points';
end $$;

reset role;
select 'four: all assertions passed' as result;
rollback;
```

- [ ] **Step 2: Run, expect FAIL:** `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -qtA -f supabase/tests/four.test.sql` → `function public.get_four does not exist`.

- [ ] **Step 3: Write the migration** `20261012000100_four_at_once.sql`:

```sql
-- Four at once: four 5-letter boards, nine guesses, one game.
--
-- A Four game N is four `puzzles` rows (mode 4, board 1-4) and one attempt per
-- board, so every rule about answers, marks and membership applies unchanged:
-- each board's answer is as secret as any other puzzle's. The order comes from
-- the existing `puzzle_index`, which already folds the mode into its hash, so
-- mode 4 at positions 4(N-1)+1..4 is a shuffle of its own. See the spec:
-- docs/superpowers/specs/2026-10-12-more-games-design.md
-- ---------------------------------------------------------------------------

-- Puzzles: a board column, mode 4, and 5-letter answers for it.
alter table public.puzzles add column board smallint not null default 1;
alter table public.puzzles drop constraint puzzles_mode_valid;
alter table public.puzzles drop constraint puzzles_answer_shape;
alter table public.puzzles
  add constraint puzzles_mode_valid   check (mode in (4, 5, 6, 7)),
  add constraint puzzles_board_valid  check (board between 1 and 4 and (mode = 4 or board = 1)),
  add constraint puzzles_answer_shape check (
    answer ~ '^[a-z]+$' and char_length(answer) = case mode when 4 then 5 else mode end);

-- Uniqueness now includes the board. The old unique was declared inline, so it
-- has the default name.
alter table public.puzzles drop constraint puzzles_room_id_mode_number_key;
alter table public.puzzles add constraint puzzles_room_mode_number_board_key
  unique (room_id, mode, number, board);

-- Up to nine guesses; the guess functions enforce 6 or 9 by mode.
alter table public.attempts drop constraint attempts_guess_count_valid;
alter table public.attempts add constraint attempts_guess_count_valid
  check (guess_count between 0 and 9);

-- The answer-free projection gains the board.
create or replace view public.room_puzzles
  with (security_invoker = on, security_barrier = true)
  as select id, room_id, mode, number, created_at, board
       from public.puzzles;
```

Then, in the same file:

1. **`get_puzzle`**: `create or replace` it with one added guard right after the `p_mode not in (5, 6, 7)` check — that check already refuses 4, so verify it does and leave the function untouched if so. The `on conflict (room_id, mode, number)` clause must become `on conflict (room_id, mode, number, board)` because the old unique constraint is gone — copy the whole function from `20260909002000_get_puzzle_rpc.sql` and change only that line.

2. **`submit_guess`**: copy the function from `20260909001000_submit_guess_rpc.sql`; after the `v_puzzle.id is null` membership check add:

```sql
  if v_puzzle.mode = 4 then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'wrong_mode', 'message', 'Four at once is played on its own screen.'));
  end if;
```

3. **`four_game_body`** (internal, `language sql stable security definer`, no client grant): builds the `game` object for (player, room, number). For each board `b` in 1..4 left-joined to the caller's attempt: `board`, `puzzleId`, `attemptId`, `marks` (the attempt's `marks`, default `'{}'`), `guessCount`, `solved`, and `word` = `answer` when `a.solved or game_finished`. `guesses` = the guesses of the board attempt with the largest `guess_count`. `finished` = every board solved, or max guess_count = 9. `points` = when finished, `sum(case when a.solved then 10 - a.guess_count else 0 end)`, else null.

4. **`get_four(p_room_id, p_number)`** (`security definer`, `grant execute to authenticated`, revoke from public, anon): same opening as `get_puzzle` (auth, membership join, archived, `p_number >= 1`), then:
   - `v_reached := max(number)` over the room's mode-4 puzzles; refuse `p_number > v_reached + 1` with `puzzle_out_of_sequence` (same message shape).
   - If fewer than 4 boards exist for N: `v_count := count(*) from word_bank where len = 5`; for b in 1..4: `v_index := puzzle_index(v_room.seed, 4, 4*(p_number-1)+b, v_count)`, pick the word at that offset ordered by `(rank, word)`, `insert ... on conflict (room_id, mode, number, board) do nothing`.
   - Return `jsonb_build_object('game', four_game_body(player, room, N))`.
   - `exception when others` → `internal`, as `get_puzzle` does.

5. **`submit_four_guess(p_room_id, p_number, p_guess, p_elapsed_ms default null)`** (`security definer`, grant to authenticated):
   - auth; `rate_limit_hit('submit-guess:' || uid, 60, 60)` (shares the single-board budget);
   - membership; the four board puzzles for N must exist (else `puzzle_not_found`);
   - `pg_advisory_xact_lock(hashtextextended(player_id || ':four:' || room_id || ':' || N, 0))`;
   - load the four attempts; if finished (all solved or max guess_count = 9) → `attempt_finished`;
   - `v_guess := lower(btrim(p_guess))`; length 5 and `^[a-z]+$` else `wrong_length` (details mode 4); must exist in `guess_bank` with `len = 5` else `not_a_word`;
   - `v_elapsed := least(greatest(coalesce(p_elapsed_ms,0), coalesce(max(elapsed_ms),0), 0), 86400000)`;
   - for each board not solved: `v_marks := score_guess(v_guess, answer)`; solved if no absent/present; upsert its attempt appending the guess and `array_to_string(v_marks, ',')`, `guess_count + 1`, `elapsed_ms = v_elapsed`, `timer_mode 'off'`, `hard_mode false`; collect `marks -> board`;
   - after the loop, if every board solved or the new guess count is 9, set `finished_at = now()` on all four attempts where null (an earlier-solved board already has its own `finished_at`);
   - return `jsonb_build_object('game', four_game_body(...), 'marks', v_marks_by_board)`;
   - `exception when others` → `internal`.

6. **`four_games` view** (`with (security_barrier = true)`, owner-run like the leaderboard views, `grant select to authenticated`):

```sql
create or replace view public.four_games
  with (security_barrier = true)
  as
  select pl.room_id, pl.id as player_id, pl.name as player_name, pz.number,
         count(*) filter (where a.solved)::int                           as boards_solved,
         sum(case when a.solved then 10 - a.guess_count else 0 end)::int as points,
         max(a.guess_count)::int                                         as guesses,
         max(a.elapsed_ms)                                               as elapsed_ms,
         max(a.finished_at)                                              as finished_at
    from public.attempts a
    join public.puzzles pz on pz.id = a.puzzle_id and pz.mode = 4
    join public.players pl on pl.id = a.player_id
   where public.is_room_member(pl.room_id)
   group by pl.room_id, pl.id, pl.name, pz.number
  having count(*) filter (where a.finished_at is not null) = count(*)
     and (count(*) filter (where a.solved) = 4 or max(a.guess_count) = 9);
```

7. **Leaderboard views**: `create or replace` both `leaderboard_all` and `leaderboard_week` as `select ... from (<existing per-attempt aggregate> where pz.mode <> 4) union all (<same columns aggregated from four_games, mode 4>)` with `rank()` computed over the union, partition `(room_id, mode)`, same order keys. For the Four branch: `played = count(*)`, `solved = count(*) filter (where boards_solved = 4)`, `points = sum(points)`, `average_guesses = round(avg(guesses) filter (where boards_solved = 4), 2)`, `total_elapsed_ms = sum(elapsed_ms)`, `hard_mode = false`. The week branch filters `finished_at` the same way the existing view does. Column list and order must stay identical so PostgREST and `supabase-source.ts` are unaffected.

- [ ] **Step 4: `supabase db reset`, run the test, expect `four: all assertions passed`.**
- [ ] **Step 5: Re-run `supabase/tests/seat_handoff.test.sql`** and `npx tsx supabase/scripts/verify-sql-parity.mts` — both still pass.
- [ ] **Step 6: CI** — add after "Seat handoff" in the `sql-parity` job:

```yaml
      - name: Four at once
        run: >
          psql postgresql://postgres:postgres@127.0.0.1:54322/postgres
          -v ON_ERROR_STOP=1 -qtA -f supabase/tests/four.test.sql
```

- [ ] **Step 7: Commit** `git commit -m "Database: Four at once"`

---

### Task 4: Parity covers mode 4

**Files:** Modify `supabase/scripts/verify-sql-parity.mts`

- [ ] **Step 1:** Find the loop that compares `puzzleIndex` with `public.puzzle_index` over modes 5/6/7; add mode `4` with the 5-letter bank count and numbers that include `4*(N-1)+b` around the wrap (e.g. N in 1, 2, 416, 417 for a 1,664 bank).
- [ ] **Step 2:** Run it, expect PASS (no SQL change needed — the derivation is mode-agnostic).
- [ ] **Step 3: Commit** `git commit -m "Parity: cover the Four sequence"`

---

### Task 5: Client API for Four

**Files:** Modify `apps/web/features/game/api.ts`; Test `apps/web/features/game/api.test.ts` (create if absent)

**Interfaces — Produces:**
```ts
export interface FourBoardState {
  board: 1 | 2 | 3 | 4
  puzzleId: string
  marks: MarkRow[]
  guessCount: number
  solved: boolean
  /** Set once the board is solved or the game is over. */
  word: string | null
}
export interface FourGame {
  roomId: string
  number: number
  boards: FourBoardState[]
  guesses: string[]
  finished: boolean
  points: number | null
}
export interface GameApi {
  // existing three, plus:
  getFour(input: { roomId: string; number: number }): Promise<FourGame>
  submitFourGuess(input: { roomId: string; number: number; guess: string; elapsedMs?: number }): Promise<FourGame>
}
```

- [ ] **Step 1: Failing test** — stub `fetch` with a `get_four` body containing four boards (one solved with `word`), assert `getFour` decodes marks via `decodeMarks`, keeps `word` only where present, and throws `GameApiError('not_a_word')` for an error body.
- [ ] **Step 2: Run `pnpm --filter @wordroom/web test api`, expect FAIL.**
- [ ] **Step 3: Implement** `readFourGame(body)` next to `readGuessResult`, using `decodeMarks` from `@wordroom/shared` for each board's `marks`, and the line that reads `word` marked `// answers-ok: a board's word, only once solved or the game is over`. Add `getFour`/`submitFourGuess` to `createGameApi` via the existing `rpc` helper (`get_four` with `p_room_id`, `p_number`; `submit_four_guess` with `p_room_id`, `p_number`, `p_guess`, `p_elapsed_ms`). Update `dev/mock-api.ts` so it still satisfies `GameApi` (throw `not implemented` for the Four calls).
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `git commit -m "Game API: get_four and submit_four_guess"`

---

### Task 6: Four store

**Files:** Create `apps/web/features/four/store.ts`, `apps/web/features/four/store.test.ts`, `apps/web/features/four/index.ts`

**Interfaces — Produces:**
```ts
export type FourStatus = 'idle' | 'loading' | 'playing' | 'won' | 'over' | 'error'
export interface FourState {
  roomId: string | null
  number: number
  game: FourGame | null
  current: string
  status: FourStatus
  submitting: boolean
  shakeToken: number
  notice: { token: number; message: string } | null
  startedAt: number | null
}
export interface FourActions {
  configure(input: { roomId: string; api: GameApi }): void
  load(number: number): Promise<void>
  typeLetter(letter: string): void
  deleteLetter(): void
  submit(): Promise<void>
  next(): Promise<void>
  reset(): void
}
export const useFourStore: UseBoundStore<StoreApi<FourState & FourActions>>
/** Per letter, per board: the best known mark. */
export function quadKeyStates(game: FourGame | null): Record<string, [Mark | null, Mark | null, Mark | null, Mark | null]>
```

- [ ] **Step 1: Failing tests** with a fake `GameApi`:
  - `load(1)` sets `game` and `status: 'playing'`.
  - `typeLetter` stops at 5 letters; `deleteLetter` removes one.
  - `submit` with 4 letters sets a notice "Not enough letters" and bumps `shakeToken`, no API call.
  - `submit` with a `not_a_word` error bumps `shakeToken`, keeps `current`, sets notice.
  - a successful `submit` clears `current` and replaces `game`; `finished && all solved` → `won`, `finished` otherwise → `over`.
  - `quadKeyStates`: a letter `correct` on board 2 and `present` on board 1 reports `[present, correct, null, null]`; `correct` beats `present` beats `absent`.
  - `next()` loads `number + 1`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** with `zustand` `create`, mirroring the error handling style of `features/game/store.ts` (`GameApiError` codes → notice text; `offline`/`rate_limited` messages as the single-board store words them). Elapsed: `Date.now() - startedAt` passed as `elapsedMs`.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `git commit -m "Four: game store"`

---

### Task 7: Four screen, boards and keyboard

**Files:**
- Create: `apps/web/features/four/components/mini-board.tsx`, `quad-keyboard.tsx`, `four-screen.tsx`
- Modify: `apps/web/features/game/components/game-screen.tsx` — extract the header + mode switcher into `GameHeader` (exported) so both screens share it; the switcher's `onValueChange` calls a new `onModeChange(mode)` prop instead of the store directly.
- Modify: `apps/web/features/game/store.ts` — `setMode(4)` sets `mode` only (no puzzle load) so the switcher state stays in one store.
- Modify: `apps/web/features/game-route/index.tsx` — when `mode === 4`, render `<FourScreen …same header props />` and configure/load the Four store (resume: highest unfinished Four game from `four_games`/attempts, else next).

**Behaviour:**
- `MiniBoard({ board, guesses, current, active })`: 5 columns × 9 rows, reuse `Tile` with a `size` prop (~22px), dims when solved and shows the word under it; `current` drawn on the next row only when `active` (unsolved and game not over).
- `QuadKeyboard({ states, onKey })`: same layout and keys as `Keyboard`; each key's background is a 2×2 of the four boards' marks (CSS grid of four spans with `bg-correct`/`bg-present`/`bg-absent`/`bg-key`), letter on top. Physical keyboard handling via the existing `keys.ts` helpers.
- `FourScreen`: header, `2×2` grid of `MiniBoard`, `QuadKeyboard`; on `won`/`over` opens a result sheet (Task 8).
- Fits 375×667 with no vertical scroll (Playwright check in Task 10).

- [ ] **Step 1:** Write a render test for `MiniBoard` (solved board shows its word and has `data-solved`) and `QuadKeyboard` (key `A` with states `[correct, null, absent, null]` renders four quadrant spans with those classes). Run, expect FAIL.
- [ ] **Step 2:** Implement the three components and the header extraction; run tests, `pnpm typecheck`, `pnpm lint`. Expect PASS.
- [ ] **Step 3:** Manual check on `pnpm dev` at 375×667: switch to Four, play two guesses.
- [ ] **Step 4: Commit** `git commit -m "Four: screen, boards and keyboard"`

---

### Task 8: Four result sheet and share text

**Files:** Create `apps/web/features/four/share.ts`, `share.test.ts`, `components/four-result-sheet.tsx`

**Interfaces — Produces:** `export function fourShareText(input: { number: number; solvedAt: (number | null)[]; points: number; roomUrl: string }): string`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from 'vitest'
import { fourShareText } from './share'

describe('fourShareText', () => {
  it('shows each board as the guess that solved it, red for unsolved', () => {
    expect(
      fourShareText({ number: 12, solvedAt: [4, 6, 8, null], points: 12, roomUrl: 'https://x/j/ABCD' }),
    ).toBe('Wordroom Four No. 12 · 12 pts\n4️⃣6️⃣\n8️⃣🟥\nhttps://x/j/ABCD')
  })
  it('never names the product it is not', () => {
    expect(fourShareText({ number: 1, solvedAt: [1, 2, 3, 4], points: 30, roomUrl: '' }))
      .not.toMatch(/wordle/i)
  })
})
```

- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement** (digits 1–9 as keycap emoji `${n}️⃣`; trailing URL line omitted when empty). **Step 4: PASS.**
- [ ] **Step 5:** `FourResultSheet` — reuse `Sheet`, show the four words, points, Share (reuse the single-board share button's Web Share / clipboard path) and **Next game** (`next()`), plus `<SaveProgressNudge />` as the single-board sheet does.
- [ ] **Step 6: Commit** `git commit -m "Four: result sheet and share text"`

---

### Task 9: Leaderboard and stats for Four

**Files:** Modify `apps/web/features/leaderboard/supabase-source.ts`, `leaderboard-row.tsx`, `leaderboard-sheet.tsx`, `use-stats.ts`/`stats-panel.tsx` as needed; tests beside them.

- [ ] **Step 1: Failing tests:**
  - `fetchPuzzleProgress` for mode 4 reads all four boards of game N (`room_puzzles` where `mode=4 and number=N`, four ids) and returns per player `solvedAt: (number|null)[]` and a status (`solved` if 4 solved, `failed` if finished otherwise, `playing` if any guesses).
  - `LeaderboardRow` for mode 4 renders four chips (`4`, `6`, `8`, `–`) instead of a colour grid, with no letters.
  - Sheet description reads `Four at once` for mode 4, `N letters` otherwise.
  - `fetchStatAttempts` for mode 4 reads `four_games` and maps to `StatAttempt { mode: 4, number, solved: boards_solved = 4, guessCount: guesses }`.
- [ ] **Step 2: Run, expect FAIL. Step 3: Implement. Step 4: PASS.**
- [ ] **Step 5: Commit** `git commit -m "Leaderboard and stats for Four"`

---

### Task 10: End-to-end Four, docs, version

**Files:** Create `e2e/four.spec.ts`; Modify `docs/wordroom-spec-v1.md`, `apps/web/package.json`

- [ ] **Step 1: e2e** — create a room, switch to Four, assert four boards and no vertical scroll at 375×667, type an invalid word (shake, no row used), then play 9 valid guesses (`crane`, `slate`, …) and assert the result sheet shows four words and a points total; open the leaderboard and see one row with four chips.
- [ ] **Step 2:** Run the full suite `pnpm test:e2e` on the local stack, expect PASS.
- [ ] **Step 3:** Spec v1: 6/7 shipped; add a "Four at once" section (rules, scoring, share). Bump version: `npm --prefix apps/web version --no-git-tag-version <next patch>`.
- [ ] **Step 4:** `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
- [ ] **Step 5: Commit** and open the PR, stating the migration is not applied to production and must be applied before merge.
