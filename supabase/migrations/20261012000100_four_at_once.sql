-- Four at once: four 5-letter boards, nine guesses, one game.
--
-- A Four game N is four ordinary `puzzles` rows in mode 4, numbered
-- 4(N-1)+1 .. 4N, one per board, and one attempt per board. Everything about
-- answers, marks and membership applies unchanged: each board's answer is as
-- secret as any other puzzle's. Numbering the boards rather than adding a board
-- column keeps the (room, mode, number) key, and with it every existing upsert.
--
-- The order comes from `puzzle_index`, which already folds the mode into its
-- hash, so mode 4 is a shuffle of its own over the 5-letter bank, and the four
-- consecutive positions of a game are four different words.
--
-- Spec: docs/superpowers/specs/2026-10-12-more-games-design.md
-- ---------------------------------------------------------------------------

alter table public.puzzles drop constraint puzzles_mode_valid;
alter table public.puzzles add constraint puzzles_mode_valid check (mode in (4, 5, 6, 7));
alter table public.puzzles drop constraint puzzles_answer_shape;
alter table public.puzzles add constraint puzzles_answer_shape check (
  answer ~ '^[a-z]+$' and char_length(answer) = case mode when 4 then 5 else mode end);

-- Nine guesses in Four. The guess functions hold each mode to its own limit.
alter table public.attempts drop constraint attempts_guess_count_valid;
alter table public.attempts add constraint attempts_guess_count_valid
  check (guess_count between 0 and 9);

-- ---------------------------------------------------------------------------
-- submit_guess refuses a Four board. Otherwise unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_guess(p_puzzle_id uuid, p_guess text DEFAULT NULL::text, p_elapsed_ms integer DEFAULT NULL::integer, p_timed_out boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- A Four at once board is played only through `submit_four_guess`, which
  -- applies one guess to all four boards under a nine-guess limit. Played here,
  -- one board would get six guesses of its own and give its word away early.
  if v_puzzle.mode = 4 then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'wrong_mode', 'message', 'Four at once is played on its own board.'));
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
$function$;

-- ---------------------------------------------------------------------------
-- four_game_body — one player's view of one Four game.
--
-- Internal: called only from the two SECURITY DEFINER functions below, after
-- they have checked membership. A board's word is in the body only once that
-- board is solved or the game is over — the same reveal rule as a puzzle.
-- ---------------------------------------------------------------------------
create or replace function public.four_game_body(
  p_player_id uuid,
  p_room_id   uuid,
  p_game      int
)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  with boards as (
    select pz.number - 4 * (p_game - 1)     as board,
           pz.id                            as puzzle_id,
           pz.answer,
           a.id                             as attempt_id,
           coalesce(a.marks, '{}')          as marks,
           coalesce(a.guesses, '{}')        as guesses,
           coalesce(a.guess_count, 0)       as guess_count,
           coalesce(a.solved, false)        as solved
      from public.puzzles pz
      left join public.attempts a on a.puzzle_id = pz.id and a.player_id = p_player_id
     where pz.room_id = p_room_id and pz.mode = 4
       and pz.number between 4 * (p_game - 1) + 1 and 4 * p_game
  ),
  state as (
    select bool_and(solved) or max(guess_count) >= 9 as finished from boards
  )
  select jsonb_build_object(
    'roomId',   p_room_id,
    'number',   p_game,
    'boards',   (select jsonb_agg(jsonb_build_object(
                   'board',      board,
                   'puzzleId',   puzzle_id,
                   'attemptId',  attempt_id,
                   'marks',      to_jsonb(marks),
                   'guessCount', guess_count,
                   'solved',     solved,
                   'word',       case when solved or (select finished from state) then answer end)
                   order by board)
                 from boards),
    -- Every unsolved board has had every guess, so the longest list is the game's.
    'guesses',  (select to_jsonb(guesses) from boards order by guess_count desc limit 1),
    'finished', (select finished from state),
    'points',   case when (select finished from state) then
                  (select sum(case when solved then 10 - guess_count else 0 end) from boards)::int
                end);
$$;

revoke all on function public.four_game_body(uuid, uuid, int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_four — Four game N, created on first request.
--
-- SECURITY DEFINER for the same reason as `get_puzzle`: it reads `rooms.seed`.
-- Authorisation is its own, from `auth.uid()`, and a non-member gets the same
-- answer as a room that does not exist.
-- ---------------------------------------------------------------------------
create or replace function public.get_four(
  p_room_id uuid,
  p_number  int
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_user    uuid := auth.uid();
  v_room    public.rooms%rowtype;
  v_player  public.players%rowtype;
  v_have    int;
  v_reached int;
  v_count   int;
  v_index   int;
  v_answer  text;
  b         int;
begin
  if v_user is null then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'unauthorized', 'message', 'Sign in to play.'));
  end if;

  if p_number is null or p_number < 1 then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'bad_request', 'message', 'That is not a puzzle.'));
  end if;

  select r.* into v_room
    from public.rooms r
    join public.players pl on pl.room_id = r.id and pl.auth_user_id = v_user
   where r.id = p_room_id;

  if v_room.id is null then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'not_a_member', 'message', 'You are not a player in this room.'));
  end if;

  if v_room.archived_at is not null then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'room_archived', 'message', 'This room has been archived.'));
  end if;

  select pl.* into v_player
    from public.players pl
   where pl.room_id = v_room.id and pl.auth_user_id = v_user;

  select count(*) into v_have
    from public.puzzles pz
   where pz.room_id = v_room.id and pz.mode = 4
     and pz.number between 4 * (p_number - 1) + 1 and 4 * p_number;

  if v_have < 4 then
    -- As in `get_puzzle`: any game the room has reached is fair, the next one
    -- may be started, and nothing further ahead can be mined.
    select (coalesce(max(pz.number), 0) + 3) / 4 into v_reached
      from public.puzzles pz
     where pz.room_id = v_room.id and pz.mode = 4;

    if p_number > v_reached + 1 then
      return jsonb_build_object('error', jsonb_build_object(
        'code', 'puzzle_out_of_sequence',
        'message', 'This room has reached No. ' || v_reached
                   || '. The next puzzle is No. ' || (v_reached + 1) || '.',
        'details', jsonb_build_object('reached', v_reached, 'next', v_reached + 1)));
    end if;

    select count(*) into v_count from public.word_bank wb where wb.len = 5;
    if v_count = 0 then
      return jsonb_build_object('error', jsonb_build_object(
        'code', 'word_bank_empty', 'message', 'No answers are available for this mode.'));
    end if;

    for b in 1..4 loop
      v_index := public.puzzle_index(v_room.seed, 4, 4 * (p_number - 1) + b, v_count);

      select wb.word into v_answer
        from public.word_bank wb
       where wb.len = 5
       order by wb.rank, wb.word
       offset v_index limit 1;

      insert into public.puzzles (room_id, mode, number, answer)
      values (v_room.id, 4, 4 * (p_number - 1) + b, v_answer)
      on conflict (room_id, mode, number) do nothing;
    end loop;
  end if;

  return jsonb_build_object('game', public.four_game_body(v_player.id, v_room.id, p_number));
exception
  when others then
    raise warning 'get_four failed for room %: % (%)', p_room_id, sqlerrm, sqlstate;
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'internal', 'message', 'Something went wrong. Try again.'));
end;
$$;

revoke all on function public.get_four(uuid, int) from public, anon;
grant execute on function public.get_four(uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- submit_four_guess — one word, scored on every unsolved board at once.
--
-- SECURITY DEFINER because it reads `puzzles.answer`. Returns marks per board;
-- a board's word only once it is solved or the game is over. Errors come back
-- in the body, as `submit_guess` does, so the rate-limit hit stands.
-- ---------------------------------------------------------------------------
create or replace function public.submit_four_guess(
  p_room_id    uuid,
  p_number     int,
  p_guess      text,
  p_elapsed_ms int default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_user     uuid := auth.uid();
  v_limit    record;
  v_player   public.players%rowtype;
  v_guess    text := lower(btrim(coalesce(p_guess, '')));
  v_have     int;
  v_used     int;
  v_done     boolean;
  v_prev     int;
  v_n        int;
  v_elapsed  int;
  v_is_word  boolean;
  v_marks    text[];
  v_solved   boolean;
  v_by_board jsonb := '{}'::jsonb;
  r          record;
begin
  if v_user is null then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'unauthorized', 'message', 'Sign in to play.'));
  end if;

  select * into v_limit from public.rate_limit_hit('submit-guess:' || v_user::text, 60, 60);
  if not v_limit.allowed then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'rate_limited', 'message', 'Too many tries. Give it a minute.',
      'details', jsonb_build_object('retryAfterSeconds', v_limit.retry_after_seconds)));
  end if;

  select pl.* into v_player
    from public.players pl
   where pl.room_id = p_room_id and pl.auth_user_id = v_user;

  if v_player.id is null then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'not_a_member', 'message', 'You are not a player in this room.'));
  end if;

  begin
    select count(*) into v_have
      from public.puzzles pz
     where pz.room_id = p_room_id and pz.mode = 4
       and pz.number between 4 * (p_number - 1) + 1 and 4 * p_number;

    if v_have < 4 then
      return jsonb_build_object('error', jsonb_build_object(
        'code', 'puzzle_not_found', 'message', 'That puzzle has not started yet.'));
    end if;

    -- Two tabs guessing at once would each see the same state and both write.
    perform pg_advisory_xact_lock(
      hashtextextended(v_player.id::text || ':four:' || p_number, 0));

    select coalesce(max(a.guess_count), 0),
           coalesce(bool_and(coalesce(a.solved, false)), false),
           max(a.elapsed_ms)
      into v_used, v_done, v_prev
      from public.puzzles pz
      left join public.attempts a on a.puzzle_id = pz.id and a.player_id = v_player.id
     where pz.room_id = p_room_id and pz.mode = 4
       and pz.number between 4 * (p_number - 1) + 1 and 4 * p_number;

    if v_done or v_used >= 9 then
      return jsonb_build_object('error', jsonb_build_object(
        'code', 'attempt_finished', 'message', 'This puzzle is already over.'));
    end if;

    if length(v_guess) <> 5 or v_guess !~ '^[a-z]+$' then
      return jsonb_build_object('error', jsonb_build_object(
        'code', 'wrong_length', 'message', 'Enter a 5-letter word.',
        'details', jsonb_build_object('mode', 4)));
    end if;

    select exists (select 1 from public.guess_bank gb where gb.len = 5 and gb.word = v_guess)
      into v_is_word;
    if not v_is_word then
      return jsonb_build_object('error', jsonb_build_object(
        'code', 'not_a_word', 'message', 'Not in word list.'));
    end if;

    v_n := v_used + 1;
    v_elapsed := least(greatest(coalesce(p_elapsed_ms, 0), coalesce(v_prev, 0), 0), 86400000);

    for r in
      select pz.id as puzzle_id, pz.answer, pz.number - 4 * (p_number - 1) as board,
             a.guesses, a.marks, coalesce(a.solved, false) as solved
        from public.puzzles pz
        left join public.attempts a on a.puzzle_id = pz.id and a.player_id = v_player.id
       where pz.room_id = p_room_id and pz.mode = 4
         and pz.number between 4 * (p_number - 1) + 1 and 4 * p_number
       order by pz.number
    loop
      continue when r.solved;

      v_marks  := public.score_guess(v_guess, r.answer);
      v_solved := not ('absent' = any(v_marks) or 'present' = any(v_marks));

      insert into public.attempts (player_id, puzzle_id, guesses, marks, solved,
                                   guess_count, elapsed_ms, timer_mode, hard_mode, finished_at)
      values (v_player.id, r.puzzle_id,
              coalesce(r.guesses, '{}') || v_guess,
              coalesce(r.marks, '{}') || array_to_string(v_marks, ','),
              v_solved, v_n, v_elapsed, 'off', false,
              case when v_solved then now() end)
      on conflict (player_id, puzzle_id) do update
        set guesses     = excluded.guesses,
            marks       = excluded.marks,
            solved      = excluded.solved,
            guess_count = excluded.guess_count,
            elapsed_ms  = excluded.elapsed_ms,
            finished_at = excluded.finished_at;

      v_by_board := v_by_board || jsonb_build_object(r.board::text, array_to_string(v_marks, ','));
    end loop;

    -- The game is over when every board is solved or the ninth guess is in.
    -- Close the boards still open, so the reveal and the board both see it.
    if v_n >= 9 or not exists (
      select 1
        from public.puzzles pz
        join public.attempts a on a.puzzle_id = pz.id and a.player_id = v_player.id
       where pz.room_id = p_room_id and pz.mode = 4
         and pz.number between 4 * (p_number - 1) + 1 and 4 * p_number
         and not a.solved
    ) then
      update public.attempts a
         set finished_at = now()
        from public.puzzles pz
       where a.puzzle_id = pz.id and a.player_id = v_player.id and a.finished_at is null
         and pz.room_id = p_room_id and pz.mode = 4
         and pz.number between 4 * (p_number - 1) + 1 and 4 * p_number;
    end if;

    return jsonb_build_object(
      'game',  public.four_game_body(v_player.id, p_room_id, p_number),
      'marks', v_by_board);
  exception
    when others then
      raise warning 'submit_four_guess failed for room %: % (%)', p_room_id, sqlerrm, sqlstate;
      return jsonb_build_object('error', jsonb_build_object(
        'code', 'internal', 'message', 'Something went wrong. Try again.'));
  end;
end;
$$;

revoke all on function public.submit_four_guess(uuid, int, text, int) from public, anon;
grant execute on function public.submit_four_guess(uuid, int, text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- four_games — one row per player per finished Four game.
--
-- Owner-run and membership-filtered, like the leaderboard views, because the
-- join to `puzzles` needs a grant clients do not have. Scores only: no guesses,
-- no answers. Mirrors `fourBoardPoints` in packages/shared - change both.
-- ---------------------------------------------------------------------------
create or replace view public.four_games
  with (security_barrier = true)
  as
  select pl.room_id,
         pl.id                                                           as player_id,
         pl.name                                                         as player_name,
         (pz.number - 1) / 4 + 1                                         as number,
         count(*) filter (where a.solved)::int                           as boards_solved,
         sum(case when a.solved then 10 - a.guess_count else 0 end)::int as points,
         max(a.guess_count)::int                                         as guesses,
         max(a.elapsed_ms)                                               as elapsed_ms,
         max(a.finished_at)                                              as finished_at
    from public.attempts a
    join public.puzzles  pz on pz.id = a.puzzle_id and pz.mode = 4
    join public.players  pl on pl.id = a.player_id
   where public.is_room_member(pl.room_id)
   group by pl.room_id, pl.id, pl.name, (pz.number - 1) / 4 + 1
  having count(*) = 4 and count(*) filter (where a.finished_at is null) = 0;

revoke all on public.four_games from public, anon;
grant select on public.four_games to authenticated;

comment on view public.four_games is
  'Finished Four at once games, one row per player per game. Scores only.';

-- ---------------------------------------------------------------------------
-- The leaderboards: single-board modes from attempts, as before, and Four from
-- four_games, so that a Four row counts games rather than boards. Same columns,
-- same order, same ranking.
-- ---------------------------------------------------------------------------
create or replace view public.leaderboard_all
  with (security_barrier = true)
  as
  with rows as (
    select pl.room_id, pz.mode, pl.id as player_id, pl.name as player_name,
           pl.created_at as joined_at,
           count(*)::int                                            as played,
           count(*) filter (where a.solved)::int                    as solved,
           sum(public.attempt_points(a.solved, a.guess_count))::int as points,
           round(avg(a.guess_count) filter (where a.solved), 2)     as average_guesses,
           sum(a.elapsed_ms)::bigint                                as total_elapsed_ms,
           bool_or(a.hard_mode)                                     as hard_mode
      from public.attempts a
      join public.puzzles  pz on pz.id = a.puzzle_id
      join public.players  pl on pl.id = a.player_id
     where a.finished_at is not null
       and pz.mode <> 4
       and public.is_room_member(pl.room_id)
     group by pl.room_id, pz.mode, pl.id, pl.name, pl.created_at
    union all
    select fg.room_id, 4, fg.player_id, fg.player_name, pl.created_at,
           count(*)::int,
           count(*) filter (where fg.boards_solved = 4)::int,
           sum(fg.points)::int,
           round(avg(fg.guesses) filter (where fg.boards_solved = 4), 2),
           sum(fg.elapsed_ms)::bigint,
           false
      from public.four_games fg
      join public.players pl on pl.id = fg.player_id
     group by fg.room_id, fg.player_id, fg.player_name, pl.created_at
  )
  select room_id, mode, player_id, player_name, played, solved, points, average_guesses,
         total_elapsed_ms, hard_mode,
         rank() over (
           partition by room_id, mode
           order by points desc, average_guesses asc nulls last,
                    total_elapsed_ms asc nulls last, joined_at asc
         )::int as rank
    from rows;

create or replace view public.leaderboard_week
  with (security_barrier = true)
  as
  with rows as (
    select pl.room_id, pz.mode, pl.id as player_id, pl.name as player_name,
           pl.created_at as joined_at,
           count(*)::int                                            as played,
           count(*) filter (where a.solved)::int                    as solved,
           sum(public.attempt_points(a.solved, a.guess_count))::int as points,
           round(avg(a.guess_count) filter (where a.solved), 2)     as average_guesses,
           sum(a.elapsed_ms)::bigint                                as total_elapsed_ms,
           bool_or(a.hard_mode)                                     as hard_mode
      from public.attempts a
      join public.puzzles  pz on pz.id = a.puzzle_id
      join public.players  pl on pl.id = a.player_id
      join public.rooms    r  on r.id  = pl.room_id
     where a.finished_at is not null
       and a.finished_at >= (
         date_trunc('week', (now() at time zone r.timezone)) at time zone r.timezone
       )
       and pz.mode <> 4
       and public.is_room_member(pl.room_id)
     group by pl.room_id, pz.mode, pl.id, pl.name, pl.created_at
    union all
    select fg.room_id, 4, fg.player_id, fg.player_name, pl.created_at,
           count(*)::int,
           count(*) filter (where fg.boards_solved = 4)::int,
           sum(fg.points)::int,
           round(avg(fg.guesses) filter (where fg.boards_solved = 4), 2),
           sum(fg.elapsed_ms)::bigint,
           false
      from public.four_games fg
      join public.players pl on pl.id = fg.player_id
      join public.rooms   r  on r.id  = fg.room_id
     where fg.finished_at >= (
       date_trunc('week', (now() at time zone r.timezone)) at time zone r.timezone
     )
     group by fg.room_id, fg.player_id, fg.player_name, pl.created_at
  )
  select room_id, mode, player_id, player_name, played, solved, points, average_guesses,
         total_elapsed_ms, hard_mode,
         rank() over (
           partition by room_id, mode
           order by points desc, average_guesses asc nulls last,
                    total_elapsed_ms asc nulls last, joined_at asc
         )::int as rank
    from rows;
