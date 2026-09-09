-- Fetch a puzzle in one round trip, without an Edge Function.
--
-- The same move `submit_guess` made, and for the same measured reason: a POST
-- to an Edge Function that does not exist costs 528-676ms, while a PostgREST
-- query doing real work costs 175-195ms. `get-puzzle` was 1.58-1.78s in
-- production and became the slowest thing in the app the moment guesses stopped
-- going through a function.
--
-- WHAT HAD TO MOVE. `puzzle_context` and `materialise_puzzle` already existed;
-- the reason `get-puzzle` stayed a function was the step between them - a
-- SHA-256 and a Fisher-Yates shuffle over the word bank, keyed by the room's
-- seed. The seed is as secret as an answer, so that step cannot happen in the
-- browser, which left the function as the only place it could run.
--
-- It runs here now, and it has to be EXACT. The shuffle decides which word a
-- room sees for every puzzle it will ever play; an implementation that is
-- nearly right changes every room's sequence silently. It is held to the
-- TypeScript by `supabase/scripts/verify-sql-parity.mts`, which compares 1,200
-- derivations across all three modes including the wrap boundary. Measured at
-- 1.5-3ms per call, and only on first materialisation.

--
-- Every operation below mirrors a JavaScript one, and JavaScript's bitwise
-- operators coerce to 32 bits. `bigint` carries the value and `& 4294967295`
-- is the coercion; without it Postgres would keep the high bits JavaScript
-- discards and the two would diverge on the first multiply.
create or replace function public.puzzle_index(
  p_seed   text,
  p_mode   int,
  p_number int,
  p_count  int
)
returns int
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  m      constant bigint := 4294967295;  -- 2^32 - 1
  epoch  int := (p_number - 1) / p_count;
  pos    int := (p_number - 1) % p_count;
  digest bytea;
  a bigint; b bigint; c bigint; d bigint;
  rotated bigint; result bigint; t bigint;
  ord    int[];
  i int; j int; swap int;
begin
  if p_count <= 0 then
    raise exception 'puzzle_index: empty bank';
  end if;

  digest := sha256(convert_to(p_seed || '|' || p_mode || '|epoch:' || epoch, 'UTF8'));

  -- Four big-endian 32-bit words, as `read()` does. `get_byte` is 0-indexed.
  a := ((get_byte(digest,0)::bigint << 24) | (get_byte(digest,1)::bigint << 16)
     |  (get_byte(digest,2)::bigint <<  8) |  get_byte(digest,3)::bigint);
  b := ((get_byte(digest,4)::bigint << 24) | (get_byte(digest,5)::bigint << 16)
     |  (get_byte(digest,6)::bigint <<  8) |  get_byte(digest,7)::bigint);
  c := ((get_byte(digest,8)::bigint << 24) | (get_byte(digest,9)::bigint << 16)
     |  (get_byte(digest,10)::bigint << 8) |  get_byte(digest,11)::bigint);
  d := ((get_byte(digest,12)::bigint << 24) | (get_byte(digest,13)::bigint << 16)
     |  (get_byte(digest,14)::bigint << 8) |  get_byte(digest,15)::bigint);
  if a = 0 then a := 1; end if;
  if b = 0 then b := 2; end if;
  if c = 0 then c := 3; end if;
  if d = 0 then d := 4; end if;

  ord := array(select generate_series(0, p_count - 1));

  for i in reverse (p_count - 1) .. 1 loop
    -- One draw of xoshiro128**.
    rotated := (b * 5) & m;
    result  := ((((rotated << 7) | (rotated >> 25)) & m) * 9) & m;
    t       := (b << 9) & m;
    c := (c # a) & m;
    d := (d # b) & m;
    b := (b # c) & m;
    a := (a # d) & m;
    c := (c # t) & m;
    d := ((d << 11) | (d >> 21)) & m;

    j := result % (i + 1);
    swap := ord[i + 1];          -- plpgsql arrays are 1-based; ord[k+1] is index k
    ord[i + 1] := ord[j + 1];
    ord[j + 1] := swap;
  end loop;

  return ord[pos + 1];
end;
$$;

comment on function public.puzzle_index(text, int, int, int) is
  'The room''s running order, position by position. Takes the room seed: service_role and SECURITY DEFINER callers only.';

revoke all on function public.puzzle_index(text, int, int, int) from public, anon, authenticated;
grant execute on function public.puzzle_index(text, int, int, int) to service_role;

-- ---------------------------------------------------------------------------
-- The handler.
--
-- SECURITY DEFINER because it reads `rooms.seed`, which derives every answer a
-- room will ever use and has no column grant for any client role. So the
-- authorisation is this function's own: `auth.uid()` first, and a caller with
-- no player row in the room gets `not_a_member` - the same answer a room id
-- that does not exist gets, so the id space cannot be probed.
--
-- Nothing in the response can carry an answer: it is four scalars, named one by
-- one, and `puzzles.answer` is not among them.
-- ---------------------------------------------------------------------------
create or replace function public.get_puzzle(
  p_room_id uuid,
  p_mode    int,
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
  v_puzzle  public.puzzles%rowtype;
  v_reached int;
  v_count   int;
  v_index   int;
  v_answer  text;
begin
  if v_user is null then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'unauthorized', 'message', 'Sign in to play.'));
  end if;

  if p_mode not in (5, 6, 7) or p_number < 1 then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'bad_request', 'message', 'That is not a puzzle.'));
  end if;

  -- Membership is the join. No row means not a member, and equally means no
  -- such room; the two are deliberately one answer.
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

  select pz.* into v_puzzle
    from public.puzzles pz
   where pz.room_id = v_room.id and pz.mode = p_mode and pz.number = p_number;

  -- Already materialised: nothing to derive, and the sequence guard below has
  -- nothing to say about a puzzle that exists.
  if v_puzzle.id is not null then
    return jsonb_build_object('puzzle', jsonb_build_object(
      'id', v_puzzle.id, 'roomId', v_puzzle.room_id,
      'mode', v_puzzle.mode, 'number', v_puzzle.number));
  end if;

  -- Players advance independently, so any number the room has reached is fair
  -- game - you can go back to one you skipped. What you cannot do is jump ahead
  -- and materialise puzzle 900, which would let one player mine the sequence
  -- far beyond where the room actually is.
  select coalesce(max(pz.number), 0) into v_reached
    from public.puzzles pz
   where pz.room_id = v_room.id and pz.mode = p_mode;

  if p_number > v_reached + 1 then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'puzzle_out_of_sequence',
      'message', 'This room has reached No. ' || v_reached
                 || '. The next puzzle is No. ' || (v_reached + 1) || '.',
      'details', jsonb_build_object('reached', v_reached, 'next', v_reached + 1)));
  end if;

  select count(*) into v_count from public.word_bank wb where wb.len = p_mode;
  if v_count = 0 then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'word_bank_empty', 'message', 'No answers are available for this mode.'));
  end if;

  v_index := public.puzzle_index(v_room.seed, p_mode, p_number, v_count);

  select wb.word into v_answer
    from public.word_bank wb
   where wb.len = p_mode
   order by wb.rank, wb.word
   offset v_index limit 1;

  if v_answer is null then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'word_bank_empty', 'message', 'No answers are available for this mode.'));
  end if;

  -- Two requests for the same new puzzle derive the same word, so whichever
  -- lands second reads back a row identical to the one it was going to write.
  insert into public.puzzles (room_id, mode, number, answer)
  values (v_room.id, p_mode, p_number, v_answer)
  on conflict (room_id, mode, number) do nothing
  returning * into v_puzzle;

  if v_puzzle.id is null then
    select * into v_puzzle from public.puzzles
     where room_id = v_room.id and mode = p_mode and number = p_number;
  end if;

  return jsonb_build_object('puzzle', jsonb_build_object(
    'id', v_puzzle.id, 'roomId', v_puzzle.room_id,
    'mode', v_puzzle.mode, 'number', v_puzzle.number));
exception
  when others then
    -- As in `submit_guess`: a raised exception reaches PostgREST verbatim, and
    -- a constraint violation brings the failing row with it.
    raise warning 'get_puzzle failed for room %: % (%)', p_room_id, sqlerrm, sqlstate;
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'internal', 'message', 'Something went wrong. Try again.'));
end;
$$;

revoke all on function public.get_puzzle(uuid, int, int) from public, anon;
grant execute on function public.get_puzzle(uuid, int, int) to authenticated;

comment on function public.get_puzzle(uuid, int, int) is
  'The room''s puzzle No. N for a mode, created on first request. SECURITY DEFINER: reads rooms.seed, and returns four scalars that cannot carry an answer.';
