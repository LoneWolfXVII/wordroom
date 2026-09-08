-- One round trip for everything `get-puzzle` needs, and one more to create the
-- puzzle if it does not exist yet.
--
-- The same problem `guess_context` solved, in the other function. Fetching a
-- puzzle was four sequential queries on the warm path — membership, room,
-- highest number reached, the puzzle itself — and seven on the cold one, which
-- adds the word-bank count, the word at the derived index, and the insert.
--
-- Four round trips is not four queries' worth of time. Measured from India
-- against the project as it stands (Tokyo, t3.nano), a request that Postgres
-- rejects before doing any work at all still takes 440-490ms, and an endpoint
-- that never touches Postgres costs the same. The cost is the trip, not the
-- query, so the only thing worth optimising is how many trips there are.
-- Four becomes one, and seven becomes two.
--
-- The second one cannot be folded into the first: the index into the word bank
-- is a SHA-256 of the room's seed computed in the function, and the seed cannot
-- leave the server, so the round trip between deriving and using it is real.
--
-- SECURITY. `puzzle_context` returns the room row, which carries `seed` — the
-- value every answer the room will ever use is derived from. That makes it
-- exactly as dangerous as `guess_context`, which returns an answer, and it is
-- locked down the same way: service_role only, SECURITY INVOKER so it grants no
-- privilege of its own.

create or replace function public.puzzle_context(
  p_room_id uuid,
  p_mode    int,
  p_number  int,
  p_user_id uuid
)
returns table (
  room       jsonb,
  player     jsonb,
  reached    int,
  puzzle     jsonb,
  bank_count int
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    to_jsonb(r)  as room,
    to_jsonb(pl) as player,
    -- Highest number this room has reached in this mode; 0 when it has none.
    coalesce(
      (select max(pz.number) from public.puzzles pz
        where pz.room_id = r.id and pz.mode = p_mode),
      0
    )::int as reached,
    -- The puzzle asked for, or null when it has not been materialised yet.
    (select to_jsonb(pz) from public.puzzles pz
      where pz.room_id = r.id and pz.mode = p_mode and pz.number = p_number) as puzzle,
    (select count(*) from public.word_bank wb where wb.len = p_mode)::int as bank_count
  from public.rooms r
  join public.players pl
    on pl.room_id = r.id
   and pl.auth_user_id = p_user_id
  where r.id = p_room_id;
$$;

revoke all on function public.puzzle_context(uuid, int, int, uuid) from public, anon, authenticated;
grant execute on function public.puzzle_context(uuid, int, int, uuid) to service_role;

comment on function public.puzzle_context(uuid, int, int, uuid) is
  'Room, the caller''s player row, the highest number reached, the puzzle if it exists, and the word-bank size - in one round trip. Returns the room seed: service_role only.';

-- The insert half. Takes an index rather than deriving one, because the
-- derivation is a SHA-256 that lives in the edge function alongside the tests
-- that pin it; there is no second definition of the sequence here.
--
-- `on conflict do nothing` then re-select is the same race handling the
-- TypeScript had, minus the round trip: two requests for the same new puzzle
-- derive the same word, so whichever lands second reads back a row identical to
-- the one it was going to write.
create or replace function public.materialise_puzzle(
  p_room_id uuid,
  p_mode    int,
  p_number  int,
  p_index   int
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $$
declare
  v_answer text;
  v_row    public.puzzles%rowtype;
begin
  -- `rank` is unique within a length; ordering by word as well keeps the
  -- sequence stable even if a future seed ever repeats a rank. Mirrors the
  -- order the TypeScript used.
  select wb.word into v_answer
    from public.word_bank wb
   where wb.len = p_mode
   order by wb.rank, wb.word
   offset p_index
   limit 1;

  if v_answer is null then
    return null;
  end if;

  insert into public.puzzles (room_id, mode, number, answer)
  values (p_room_id, p_mode, p_number, v_answer)
  on conflict (room_id, mode, number) do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row
      from public.puzzles
     where room_id = p_room_id and mode = p_mode and number = p_number;
  end if;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.materialise_puzzle(uuid, int, int, int) from public, anon, authenticated;
grant execute on function public.materialise_puzzle(uuid, int, int, int) to service_role;

comment on function public.materialise_puzzle(uuid, int, int, int) is
  'Create the room''s puzzle for (mode, number) at a caller-derived word-bank index, or return the one that already exists. Returns the answer - service_role only.';
