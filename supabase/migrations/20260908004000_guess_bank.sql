-- Move the spelling dictionary out of the function bundle and into Postgres.
--
-- `submit-guess` had all three guess lists compiled into it — 47,000 words,
-- about 344KB of source and the bulk of a 1.7MB bundle. A warm request never
-- touched most of it, but every *cold* start paid to download and instantiate
-- the lot, which is why the first guess after an idle period took ~5s while a
-- warm one took 0.7s.
--
-- The check moves into the query the function already makes. `guess_context`
-- gains a `p_guess` argument and answers "is this a real word" alongside the
-- puzzle, the player and the attempt — so this costs no extra round trip, and
-- the function stops carrying a dictionary it can ask about instead.
--
-- NOT SECRET, unlike `word_bank`. These are the guessable words, the same list
-- the browser already ships so it can shake instantly. It is revoked from
-- clients anyway: they have their own copy and never need to ask.

create table public.guess_bank (
  word text not null,
  len  int  not null,
  primary key (len, word),
  constraint guess_bank_len_valid  check (len in (5, 6, 7)),
  constraint guess_bank_word_shape check (word ~ '^[a-z]+$' and char_length(word) = len)
);

alter table public.guess_bank enable row level security;
revoke all on public.guess_bank from anon, authenticated;
grant  all on public.guess_bank to   service_role;

comment on table public.guess_bank is
  'Spelling dictionary for server-side guess validation. Not secret - answers live in word_bank.';

-- Replaced rather than altered: the argument list changes, and the old
-- three-argument form should not linger where a caller could still reach it.
drop function if exists public.guess_context(uuid, uuid);

create or replace function public.guess_context(
  p_puzzle_id uuid,
  p_user_id   uuid,
  p_guess     text default null
)
returns table (
  puzzle        jsonb,
  player        jsonb,
  attempt       jsonb,
  guess_is_word boolean
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    to_jsonb(pz) as puzzle,
    to_jsonb(pl) as player,
    case when a.id is null then null else to_jsonb(a) end as attempt,
    -- Null for a timeout, which carries no guess and needs no dictionary.
    case
      when p_guess is null then null
      else exists (
        select 1 from public.guess_bank g
         where g.len = pz.mode and g.word = lower(btrim(p_guess))
      )
    end as guess_is_word
  from public.puzzles pz
  join public.players pl
    on pl.room_id = pz.room_id
   and pl.auth_user_id = p_user_id
  left join public.attempts a
    on a.puzzle_id = pz.id
   and a.player_id = pl.id
  where pz.id = p_puzzle_id;
$$;

revoke all on function public.guess_context(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.guess_context(uuid, uuid, text) to service_role;

comment on function public.guess_context(uuid, uuid, text) is
  'Puzzle, the caller''s player row, their attempt, and whether the guess is a word - one round trip. Returns the answer, so service_role only.';
