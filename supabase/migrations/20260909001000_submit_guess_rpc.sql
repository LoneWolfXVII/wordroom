-- Play a guess in one round trip, without an Edge Function.
--
-- WHY THIS EXISTS. `submit-guess` took 1.0-1.7s in production and the queries
-- were never the reason. Measured from India against the deployed project:
--
--   POST to an Edge Function that does not exist (404, nothing invoked)
--     528 / 664 / 645 / 676 ms
--   One PostgREST query doing real work
--     175 / 195 / 180 ms
--
-- An empty function costs three times a real query. That ~600ms is Supabase's
-- Edge Function routing, spent before a line of our code runs, and no amount of
-- query tuning touches it. On top of it the function made two sequential round
-- trips of its own - read the context, write the attempt - each leaving the
-- Mumbai edge for the Tokyo database.
--
-- Called through PostgREST this is one hop and one query. The expectation is
-- ~1.1s -> ~300ms, and ~80ms once the database sits in the same region.
--
-- WHY THIS DOES NOT DUPLICATE THE RULES. `packages/shared` exists so the app and
-- the Edge Functions share one definition of the domain. The browser never
-- scored a guess in production - `scoreGuess` appears there only in
-- `features/game/dev/mock-api.ts`, a harness - so moving scoring here does not
-- create a second implementation, it moves the only one. The TypeScript stays
-- for the mock and for its tests, and `supabase/scripts/verify-sql-parity.mts`
-- holds the two to the same answers against a live database.

-- ---------------------------------------------------------------------------
-- Scoring: the two-pass Wordle rule, identical to `scoreGuess`.
-- ---------------------------------------------------------------------------
create or replace function public.score_guess(p_guess text, p_answer text)
returns text[]
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  n      int := length(p_answer);
  g      text := lower(p_guess);
  a      text := lower(p_answer);
  marks  text[];
  pool   jsonb := '{}'::jsonb;
  i      int;
  gi     text;
  ai     text;
  spare  int;
begin
  if length(g) <> n then
    raise exception 'score_guess: length mismatch (guess %, answer %)', length(g), n;
  end if;

  marks := array_fill('absent'::text, array[n]);

  -- Greens are claimed first; what is left over is what a yellow may consume.
  for i in 1..n loop
    gi := substr(g, i, 1);
    ai := substr(a, i, 1);
    if gi = ai then
      marks[i] := 'correct';
    else
      pool := jsonb_set(pool, array[ai], to_jsonb(coalesce((pool ->> ai)::int, 0) + 1), true);
    end if;
  end loop;

  -- A letter is present only while an unclaimed copy of it remains, so a guess
  -- with more copies than the answer holds gets absent for the surplus.
  for i in 1..n loop
    continue when marks[i] = 'correct';
    gi := substr(g, i, 1);
    spare := coalesce((pool ->> gi)::int, 0);
    if spare > 0 then
      marks[i] := 'present';
      pool := jsonb_set(pool, array[gi], to_jsonb(spare - 1), true);
    end if;
  end loop;

  return marks;
end;
$$;

comment on function public.score_guess(text, text) is
  'Two-pass Wordle scoring. Takes an answer, so service_role and SECURITY DEFINER callers only.';

revoke all on function public.score_guess(text, text) from public, anon, authenticated;
grant execute on function public.score_guess(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Hard mode: a guess may not drop a revealed green or omit a revealed yellow.
-- Letters shown to be absent stay legal - hard mode constrains what you must
-- keep, not what you may try. Mirrors `isHardModeValid`.
-- ---------------------------------------------------------------------------
create or replace function public.hard_mode_violation(
  p_guess    text,
  p_guesses  text[],
  p_marks    text[]
)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  g        text := lower(p_guess);
  row_i    int;
  i        int;
  word     text;
  row_mk   text[];
  letter   text;
  mark     text;
  fixed    jsonb := '{}'::jsonb;   -- position (0-based, as text) -> letter
  needed   jsonb := '{}'::jsonb;   -- letter -> copies the guess must contain
  per_row  jsonb;
  seen     text[] := '{}';         -- letters in first-appearance order
  pos      int;
  want     int;
  have     int;
  ordinals text[] := array['1st','2nd','3rd','4th','5th','6th','7th'];
begin
  -- Collapse the previous rows into the hints that must be carried forward. The
  -- required count for a letter is the MOST any single row revealed, not the
  -- sum: two rows each showing one yellow E prove there is one E, not two.
  for row_i in 1..coalesce(array_length(p_guesses, 1), 0) loop
    word    := lower(p_guesses[row_i]);
    row_mk  := string_to_array(p_marks[row_i], ',');
    per_row := '{}'::jsonb;

    for i in 1..coalesce(array_length(row_mk, 1), 0) loop
      letter := substr(word, i, 1);
      mark   := row_mk[i];
      continue when letter = '';

      if mark = 'correct' then
        fixed := jsonb_set(fixed, array[(i - 1)::text], to_jsonb(letter), true);
      end if;

      if mark in ('correct', 'present') then
        per_row := jsonb_set(per_row, array[letter],
                             to_jsonb(coalesce((per_row ->> letter)::int, 0) + 1), true);
        if not (letter = any(seen)) then
          seen := seen || letter;
        end if;
      end if;
    end loop;

    for letter in select jsonb_object_keys(per_row) loop
      needed := jsonb_set(needed, array[letter],
                          to_jsonb(greatest(coalesce((needed ->> letter)::int, 0),
                                            (per_row ->> letter)::int)), true);
    end loop;
  end loop;

  -- Greens first, left to right, so the message names the earliest slip.
  for pos in select key::int from jsonb_object_keys(fixed) as key order by key::int loop
    letter := fixed ->> pos::text;
    if substr(g, pos + 1, 1) <> letter then
      return jsonb_build_object(
        'reason', 'position',
        'message', coalesce(ordinals[pos + 1], (pos + 1)::text || 'th')
                   || ' letter must be ' || upper(letter));
    end if;
  end loop;

  -- Then the counts, in the order the letters were first revealed, which is the
  -- order the TypeScript's Map iterates in.
  foreach letter in array seen loop
    want := coalesce((needed ->> letter)::int, 0);
    continue when want = 0;
    have := length(g) - length(replace(g, letter, ''));
    if have < want then
      return jsonb_build_object(
        'reason', 'missing',
        'message', case when want > 1
                     then 'Guess must contain ' || want || ' ' || upper(letter) || 's'
                     else 'Guess must contain ' || upper(letter) end);
    end if;
  end loop;

  return null;  -- valid
end;
$$;

comment on function public.hard_mode_violation(text, text[], text[]) is
  'Null when the guess honours hard mode, otherwise {reason, message}. Mirrors isHardModeValid.';

revoke all on function public.hard_mode_violation(text, text[], text[]) from public, anon, authenticated;
grant execute on function public.hard_mode_violation(text, text[], text[]) to service_role;


-- The half that decides and writes, split out only so the function above stays
-- readable: everything up there is authorisation and setup, everything here is
-- the game. Mirrors `playGuess` in `_shared/guess-engine.ts` step for step.
create or replace function public.submit_guess_apply(
  p_puzzle   public.puzzles,
  p_player   public.players,
  p_attempt  public.attempts,
  p_guess    text,
  p_timed_out boolean,
  p_elapsed  int,
  p_hard     boolean,
  p_timer    text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt  public.attempts%rowtype := p_attempt;
  v_marks    text[];
  v_solved   boolean;
  v_count    int;
  v_finished timestamptz;
  v_over     boolean;
  v_viol     jsonb;
  v_is_word  boolean;
begin
  v_over := v_attempt.id is not null
            and (v_attempt.finished_at is not null
                 or v_attempt.solved
                 or coalesce(v_attempt.guess_count, 0) >= 6);

  -- A timeout on an attempt that is already over answers the same way twice,
  -- so a retry after a dropped connection still gets the player their result.
  if p_timed_out then
    if v_over then
      return public.guess_result_body(v_attempt, p_puzzle.answer, null);
    end if;

    insert into public.attempts (player_id, puzzle_id, guesses, marks, solved,
                                 guess_count, elapsed_ms, timer_mode, hard_mode, finished_at)
    values (p_player.id, p_puzzle.id, coalesce(v_attempt.guesses, '{}'),
            coalesce(v_attempt.marks, '{}'), false,
            coalesce(v_attempt.guess_count, 0), p_elapsed, p_timer, p_hard, now())
    on conflict (player_id, puzzle_id) do update
      set finished_at = now(), elapsed_ms = excluded.elapsed_ms
    returning * into v_attempt;

    return public.guess_result_body(v_attempt, p_puzzle.answer, null);
  end if;

  if v_over then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'attempt_finished', 'message', 'This puzzle is already over.'));
  end if;

  if length(p_guess) <> p_puzzle.mode or p_guess !~ '^[a-z]+$' then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'wrong_length', 'message', 'Enter a ' || p_puzzle.mode || '-letter word.',
      'details', jsonb_build_object('mode', p_puzzle.mode)));
  end if;

  select exists (select 1 from public.guess_bank gb
                  where gb.len = p_puzzle.mode and gb.word = p_guess)
    into v_is_word;
  if not v_is_word then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'not_a_word', 'message', 'Not in word list.'));
  end if;

  if p_hard then
    -- The message only ever names letters this player has already revealed to
    -- themselves, so it tells them nothing new about the answer.
    v_viol := public.hard_mode_violation(p_guess,
                coalesce(v_attempt.guesses, '{}'), coalesce(v_attempt.marks, '{}'));
    if v_viol is not null then
      return jsonb_build_object('error', jsonb_build_object(
        'code', 'hard_mode_violation', 'message', v_viol ->> 'message',
        'details', jsonb_build_object('reason', v_viol ->> 'reason')));
    end if;
  end if;

  v_marks    := public.score_guess(p_guess, p_puzzle.answer);
  v_solved   := not ('absent' = any(v_marks) or 'present' = any(v_marks));
  v_count    := coalesce(v_attempt.guess_count, 0) + 1;
  v_finished := case when v_solved or v_count >= 6 then now() else null end;

  insert into public.attempts (player_id, puzzle_id, guesses, marks, solved,
                               guess_count, elapsed_ms, timer_mode, hard_mode, finished_at)
  values (p_player.id, p_puzzle.id,
          coalesce(v_attempt.guesses, '{}') || p_guess,
          coalesce(v_attempt.marks, '{}') || array_to_string(v_marks, ','),
          v_solved, v_count, p_elapsed, p_timer, p_hard, v_finished)
  on conflict (player_id, puzzle_id) do update
    set guesses     = excluded.guesses,
        marks       = excluded.marks,
        solved      = excluded.solved,
        guess_count = excluded.guess_count,
        elapsed_ms  = excluded.elapsed_ms,
        finished_at = excluded.finished_at
  returning * into v_attempt;

  return public.guess_result_body(v_attempt, p_puzzle.answer, v_marks);
end;
$$;

revoke all on function public.submit_guess_apply(public.puzzles, public.players, public.attempts, text, boolean, int, boolean, text) from public, anon, authenticated;

-- The response, built field by field. The answer is added only once the attempt
-- is over, which is the single place it may enter a body at all.
create or replace function public.guess_result_body(
  p_attempt public.attempts,
  p_answer  text,
  p_marks   text[]
)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'attemptId',        p_attempt.id,
    'puzzleId',         p_attempt.puzzle_id,
    'marks',            case when p_marks is null then null else to_jsonb(p_marks) end,
    'guessCount',       p_attempt.guess_count,
    'guessesRemaining', greatest(6 - p_attempt.guess_count, 0),
    'solved',           p_attempt.solved,
    'finished',         p_attempt.finished_at is not null
  )) || case
    when p_attempt.finished_at is null then '{}'::jsonb
    else jsonb_build_object(
      'answer',     p_answer,
      'points',     case when p_attempt.solved then greatest(7 - p_attempt.guess_count, 0) else 0 end,
      'finishedAt', p_attempt.finished_at,
      'elapsedMs',  p_attempt.elapsed_ms)
  end;
$$;

revoke all on function public.guess_result_body(public.attempts, text, text[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The whole guess path, in one call.
--
-- SECURITY. This is SECURITY DEFINER because it must read `puzzles.answer`,
-- which no client role may select — that column grant is the one rule this
-- project has. Being definer means the authorisation is this function's job and
-- nobody else's, so it is done first and from `auth.uid()` alone: no row comes
-- back unless the caller holds a `players` row in the puzzle's room. A caller
-- who is not a member gets `not_a_member`, the same answer they would get for a
-- puzzle id that does not exist, so the id space cannot be probed.
--
-- The answer leaves this function only when `finished_at` is set — solved, out
-- of guesses, or timed out — which is exactly the rule `guessResultBody`
-- enforces on the Edge Function side.
--
-- Errors come back in the body rather than as exceptions. PostgREST maps a
-- raised exception onto a status and a Postgres error code, which loses the
-- domain code the client needs to tell "not a word" from "already over" — and
-- an exception would also roll back the rate-limit hit, which must stand.
-- ---------------------------------------------------------------------------
create or replace function public.submit_guess(
  p_puzzle_id  uuid,
  p_guess      text default null,
  p_elapsed_ms int default null,
  p_timed_out  boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_user      uuid := auth.uid();
  v_puzzle    public.puzzles%rowtype;
  v_player    public.players%rowtype;
  v_attempt   public.attempts%rowtype;
  v_settings  jsonb;
  v_hard      boolean;
  v_timer     text;
  v_guess     text := lower(btrim(coalesce(p_guess, '')));
  v_elapsed   int;
  v_limit     record;
begin
  if v_user is null then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'unauthorized', 'message', 'Sign in to play.'));
  end if;

  -- SUBMIT_GUESS_LIMIT in `_shared/rate-limit.ts` — 60 a minute, and the
  -- argument order is (key, window, max), which is how this shipped as 30 in
  -- review and halved every player's budget. The Edge Function is still
  -- deployed against the same key, so a mismatch here does not just tighten the
  -- limit, it makes two live limiters disagree about one bucket.
  --
  -- The hit has to survive the rest of this function returning an error, which
  -- is why nothing below raises out of the transaction.
  select * into v_limit from public.rate_limit_hit('submit-guess:' || v_user::text, 60, 60);
  if not v_limit.allowed then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'rate_limited', 'message', 'Too many tries. Give it a minute.',
      'details', jsonb_build_object('retryAfterSeconds', v_limit.retry_after_seconds)));
  end if;

  -- Authorisation and every read the request needs, in one statement.
  -- Authorisation: the join is the check. No row means the caller holds no
  -- player in this puzzle's room — and it equally means the puzzle does not
  -- exist, which is deliberately the same answer, so the id space cannot be
  -- probed.
  --
  -- Two statements rather than one. `select pz.*, pl.* into v_puzzle, v_player`
  -- reads like the obvious saving and is not legal plpgsql: a record variable
  -- cannot share an INTO list. The second lookup is a point read on
  -- `players_room_auth_key`, measured at well under a tenth of a millisecond.
  select pz.* into v_puzzle
    from public.puzzles pz
    join public.players pl on pl.room_id = pz.room_id and pl.auth_user_id = v_user
   where pz.id = p_puzzle_id;

  if v_puzzle.id is null then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'not_a_member', 'message', 'You are not a player in this room.'));
  end if;

  select pl.* into v_player
    from public.players pl
   where pl.room_id = v_puzzle.room_id and pl.auth_user_id = v_user;

  -- Serialise this player on this puzzle for the rest of the transaction.
  --
  -- Everything below is read-then-write: load the attempt, decide, upsert. Two
  -- guesses in flight interleave those and one of them is lost — both callers
  -- get marks, one guess reaches the row, and the board and the server disagree
  -- about how many are left. A straggler landing after a solve can also write
  -- `solved = false, finished_at = null` back over it and reopen a finished
  -- attempt.
  --
  -- It happens not to occur today, because `rate_limit_hit` upserts this
  -- player's row first and that row lock holds until commit. That is an
  -- accident of statement order in a function that is meant to be reordered
  -- freely, and the limiter was deliberately fail-open in TypeScript. This
  -- makes the guarantee the function's own.
  --
  -- An advisory lock rather than `SELECT ... FOR UPDATE` because the first
  -- guess of an attempt has no row to lock yet.
  perform pg_advisory_xact_lock(hashtextextended(v_player.id::text || ':' || v_puzzle.id::text, 0));

  select a.* into v_attempt
    from public.attempts a
   where a.puzzle_id = v_puzzle.id and a.player_id = v_player.id;

  -- Hard mode and the timer are snapshotted when the attempt opens, so changing
  -- a setting mid-puzzle cannot change the rules of a puzzle in play.
  --
  -- `players.settings` is a jsonb column the client holds UPDATE on, so nothing
  -- in it is a type — it is whatever that player last PATCHed. Casting it
  -- (`::boolean`) hands them a way to make this function raise: the error goes
  -- back through PostgREST with the failing row attached, which is their own
  -- guesses printed into their own network tab, and the attempt cannot be
  -- opened again until they fix the column. Compared against known values
  -- instead, exactly as `readSettings()` did.
  v_settings := coalesce(v_player.settings, '{}'::jsonb);
  -- `coalesce` around the extraction, not around the comparison: a missing key
  -- gives NULL, and `NULL = 'true'` is NULL rather than false, which lands in a
  -- NOT NULL column. Three-valued logic is the whole hazard of reading settings
  -- a client can write.
  v_hard  := coalesce(v_attempt.hard_mode, coalesce(v_settings ->> 'hardMode', '') = 'true');
  v_timer := coalesce(
    v_attempt.timer_mode,
    case when v_settings ->> 'timerMode' in ('off', 'per-puzzle', 'per-guess', 'sprint')
         then v_settings ->> 'timerMode' else 'off' end);

  -- Held monotonic, as `resolveElapsed` did: a later guess may not lower the
  -- clock. Reported time is a client value and only ever breaks ties on the
  -- leaderboard, but a number that can go backwards is a number that can be
  -- walked backwards. Bounded above so a bad value cannot overflow the int
  -- column and turn into a 400 with a row dump on it.
  v_elapsed := case
    when v_timer = 'off' then null
    else least(greatest(coalesce(p_elapsed_ms, 0), coalesce(v_attempt.elapsed_ms, 0), 0), 86400000)
  end;

  -- Nothing below may reach the network as a Postgres error.
  --
  -- PostgREST returns a raised exception verbatim, and a constraint violation
  -- carries `DETAIL: Failing row contains (...)` — which here is the caller's
  -- own guesses and marks, printed into their own network tab. It leaks nothing
  -- to anyone else, but it is a row dump where the Edge Function returned
  -- `internal`, and the next `RAISE` added anywhere under here would inherit
  -- that behaviour silently.
  --
  -- The handler is a subtransaction, so it rolls back a half-written attempt
  -- while leaving the rate-limit hit above it standing — which is the point of
  -- taking the hit before this block rather than inside it.
  begin
    return public.submit_guess_apply(
      v_puzzle, v_player, v_attempt, v_guess, p_timed_out, v_elapsed, v_hard, v_timer);
  exception
    when others then
      raise warning 'submit_guess failed for puzzle %: % (%)', p_puzzle_id, sqlerrm, sqlstate;
      return jsonb_build_object('error', jsonb_build_object(
        'code', 'internal', 'message', 'Something went wrong. Try again.'));
  end;
end;
$$;

-- This is the one function in the set a client calls, and the only one granted
-- to a client role. Everything it leans on stays service_role only.
revoke all on function public.submit_guess(uuid, text, int, boolean) from public, anon;
grant execute on function public.submit_guess(uuid, text, int, boolean) to authenticated;

comment on function public.submit_guess(uuid, text, int, boolean) is
  'Play a guess in one round trip. SECURITY DEFINER: reads puzzles.answer, and returns it only once the attempt is finished.';
