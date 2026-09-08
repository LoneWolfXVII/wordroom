-- One round trip for everything `submit-guess` needs before it can score.
--
-- The function was making six sequential network round trips per guess — verify
-- the token with GoTrue, count the rate limit, read the puzzle, read the player,
-- read the attempt, write the attempt — and a guess took about two seconds.
-- Three of those were reads that depend on nothing but the puzzle id and the
-- caller, so they are one query, not three.
--
-- SECURITY. This returns `answer`, so it is service-role only and revoked from
-- everyone else, exactly like the `puzzles` table it reads. It is SECURITY
-- INVOKER on purpose: it grants no privilege of its own, and only a caller that
-- could already read these tables can use it. The membership check is still the
-- authorisation — a puzzle id belonging to a room the caller is not in returns
-- no row, which is what the function turns into `not_a_member`.

create or replace function public.guess_context(p_puzzle_id uuid, p_user_id uuid)
returns table (
  puzzle          jsonb,
  player          jsonb,
  attempt         jsonb
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    to_jsonb(pz)                                    as puzzle,
    to_jsonb(pl)                                    as player,
    case when a.id is null then null else to_jsonb(a) end as attempt
  from public.puzzles pz
  join public.players pl
    on pl.room_id = pz.room_id
   and pl.auth_user_id = p_user_id
  left join public.attempts a
    on a.puzzle_id = pz.id
   and a.player_id = pl.id
  where pz.id = p_puzzle_id;
$$;

revoke all on function public.guess_context(uuid, uuid) from public, anon, authenticated;
grant execute on function public.guess_context(uuid, uuid) to service_role;

comment on function public.guess_context(uuid, uuid) is
  'Puzzle, the caller''s player row, and their attempt, in one round trip. Returns the answer - service_role only.';

-- The join above walks attempts by (puzzle_id, player_id). The unique
-- constraint already indexes that pair, so no new index is needed; this is only
-- here to say the lookup was considered rather than assumed.
