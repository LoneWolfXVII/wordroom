-- Four at once, end to end, in one rolled-back transaction.
-- Run: psql "$DB_URL" -v ON_ERROR_STOP=1 -qtA -f supabase/tests/four.test.sql
begin;

insert into auth.users (id, is_anonymous) values
  ('00000000-0000-0000-0000-0000000000f1', true),
  ('00000000-0000-0000-0000-0000000000f2', true);
insert into public.rooms (id, code, name, seed) values
  ('10000000-0000-0000-0000-0000000000f1', 'FWRD', 'Four', 'test-seed');
insert into public.players (id, room_id, auth_user_id, name) values
  ('30000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-0000000000f1',
   '00000000-0000-0000-0000-0000000000f1', 'Ana');

create temp table g (game jsonb);
grant all on g to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f1"}';

-- get_puzzle refuses mode 4; get_four will not jump ahead.
do $$ begin
  assert public.get_puzzle('10000000-0000-0000-0000-0000000000f1', 4, 1) ? 'error',
    'get_puzzle must refuse Four';
  assert public.get_four('10000000-0000-0000-0000-0000000000f1', 3) -> 'error' ->> 'code'
    = 'puzzle_out_of_sequence', 'cannot jump ahead';
end $$;

-- get_four materialises four boards, and shows no word yet.
insert into g select public.get_four('10000000-0000-0000-0000-0000000000f1', 1);
do $$ begin
  assert jsonb_array_length((select game from g) -> 'game' -> 'boards') = 4, 'four boards';
  assert (select count(*) from g, jsonb_array_elements(game -> 'game' -> 'boards') b
           where b ->> 'word' is not null) = 0, 'no board word before it is solved';
  assert not ((select game from g) -> 'game' ->> 'finished')::boolean, 'not finished';
end $$;

reset role;
-- The answers, read as the owner, to drive the test.
create temp table ans as
  select number as board, answer from public.puzzles
   where room_id = '10000000-0000-0000-0000-0000000000f1' and mode = 4 and number between 1 and 4;
grant select on ans to authenticated;
-- A valid guess that answers no board, for burning guesses.
create temp table filler as
  select word from public.guess_bank
   where len = 5 and word not in (select answer from ans) order by word limit 1;
grant select on filler to authenticated;
do $$ begin
  assert (select count(distinct answer) from ans) = 4, 'four different words';
  assert (select bool_and(char_length(answer) = 5) from ans), 'five-letter words';
end $$;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f1"}';

-- submit_guess refuses a Four board.
do $$ begin
  assert public.submit_guess((select (b ->> 'puzzleId')::uuid
      from g, jsonb_array_elements(game -> 'game' -> 'boards') b where b ->> 'board' = '1'),
    'crane') -> 'error' ->> 'code' = 'wrong_mode', 'submit_guess must refuse Four boards';
end $$;

-- An invalid word, or a wrong length, costs nothing.
do $$ declare r jsonb; begin
  r := public.submit_four_guess('10000000-0000-0000-0000-0000000000f1', 1, 'zzzzz');
  assert r -> 'error' ->> 'code' = 'not_a_word', 'invalid word refused';
  r := public.submit_four_guess('10000000-0000-0000-0000-0000000000f1', 1, 'cranes');
  assert r -> 'error' ->> 'code' = 'wrong_length', 'six letters refused';
  r := public.get_four('10000000-0000-0000-0000-0000000000f1', 1);
  assert jsonb_array_length(r -> 'game' -> 'guesses') = 0, 'no guess consumed';
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
  assert jsonb_array_length(r -> 'game' -> 'guesses') = 1, 'one guess recorded';
end $$;

-- Burn the remaining 8 guesses on one valid non-answer word.
do $$ declare r jsonb; w text; i int; begin
  select word into w from filler;
  for i in 1..8 loop
    r := public.submit_four_guess('10000000-0000-0000-0000-0000000000f1', 1, w);
  end loop;
  assert (r -> 'game' ->> 'finished')::boolean, 'game ends after 9 guesses';
  assert (r -> 'game' ->> 'points')::int = 9, 'one board solved on guess 1 = 9 points';
  assert (select count(*) from jsonb_array_elements(r -> 'game' -> 'boards') b
           where b ->> 'word' is not null) = 4, 'every word revealed at the end';
  assert (select (b ->> 'guessCount')::int from jsonb_array_elements(r -> 'game' -> 'boards') b
           where b ->> 'board' = '2') = 1, 'a solved board stops taking guesses';
  assert public.submit_four_guess('10000000-0000-0000-0000-0000000000f1', 1, w)
    -> 'error' ->> 'code' = 'attempt_finished', 'no guess after the end';
end $$;

-- The stats view sees one game, not four boards.
do $$ begin
  assert (select count(*) from public.four_games
           where player_id = '30000000-0000-0000-0000-0000000000f1') = 1, 'one game row';
  assert (select points from public.four_games
           where player_id = '30000000-0000-0000-0000-0000000000f1') = 9, 'game points';
  assert (select played from public.leaderboard_all
           where player_id = '30000000-0000-0000-0000-0000000000f1' and mode = 4) = 1,
    'the board counts games';
  assert (select points from public.leaderboard_all
           where player_id = '30000000-0000-0000-0000-0000000000f1' and mode = 4) = 9,
    'the board scores Four games';
end $$;

-- Game 2 may now be fetched; game 3 still may not.
do $$ begin
  assert public.get_four('10000000-0000-0000-0000-0000000000f1', 2) ? 'game', 'next game';
  assert public.get_four('10000000-0000-0000-0000-0000000000f1', 4) ? 'error', 'no jumping';
end $$;

-- A board closed unsolved by any other path (the old submit-guess Edge
-- Function's timeout) ends the game: it cannot be reopened and replayed.
reset role;
insert into public.attempts (player_id, puzzle_id, solved, guess_count, finished_at)
select '30000000-0000-0000-0000-0000000000f1', id, false, 0, now()
  from public.puzzles
 where room_id = '10000000-0000-0000-0000-0000000000f1' and mode = 4 and number = 7;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f1"}';
do $$ begin
  assert public.submit_four_guess('10000000-0000-0000-0000-0000000000f1', 2, (select word from filler))
    -> 'error' ->> 'code' = 'attempt_finished', 'a board closed unsolved ends the game';
  assert (public.get_four('10000000-0000-0000-0000-0000000000f1', 2) -> 'game' ->> 'finished')::boolean,
    'and the game reads as finished';
end $$;

-- guess_context, the old Edge Function's way in, does not serve a Four board.
reset role;
do $$ begin
  assert not exists (
    select 1 from public.guess_context(
      (select id from public.puzzles
        where room_id = '10000000-0000-0000-0000-0000000000f1' and mode = 4 and number = 5),
      '00000000-0000-0000-0000-0000000000f1')),
    'guess_context refuses a Four board';
end $$;
set local role authenticated;

-- A non-member gets nothing.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f2"}';
do $$ begin
  assert public.get_four('10000000-0000-0000-0000-0000000000f1', 1) -> 'error' ->> 'code'
    = 'not_a_member', 'non-member refused';
  assert public.submit_four_guess('10000000-0000-0000-0000-0000000000f1', 1, 'crane')
    -> 'error' ->> 'code' = 'not_a_member', 'non-member cannot guess';
  assert (select count(*) from public.four_games) = 0, 'non-member sees no games';
end $$;

reset role;
select 'four: all assertions passed' as result;
rollback;
