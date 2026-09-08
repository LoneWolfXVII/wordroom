-- Wordroom core schema.
--
-- Security posture, in one line: a puzzle answer is a server-side secret. This
-- migration creates the tables; 20260908000200_rls.sql is what makes `answer`
-- and `word_bank` unreachable from a browser. Read both together.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- word_bank — the curated answer lists. Answers only; the much larger *guess*
-- lists ship to the client as static JSON and never live here.
-- ---------------------------------------------------------------------------
create table public.word_bank (
  word text not null,
  len  int  not null,
  -- 1-based frequency rank within the length, from the wordlist build.
  rank int  not null,
  primary key (len, word),
  constraint word_bank_len_valid   check (len in (5, 6, 7)),
  constraint word_bank_word_shape  check (word ~ '^[a-z]+$' and char_length(word) = len),
  constraint word_bank_rank_valid  check (rank >= 1)
);

create index word_bank_len_rank_idx on public.word_bank (len, rank);

comment on table public.word_bank is
  'Answer words. Never selectable by anon or authenticated - see the RLS migration.';

-- ---------------------------------------------------------------------------
-- rooms
-- ---------------------------------------------------------------------------
create table public.rooms (
  id             uuid primary key default gen_random_uuid(),
  -- 4 characters from A-Z and 2-9, minus 0/O and 1/I so a code cannot be
  -- misread. Mirrors CODE_ALPHABET in @wordroom/shared.
  code           text not null unique,
  name           text not null,
  host_player_id uuid,
  max_players    int  not null default 8,
  -- Seeds the room's puzzle sequence. Server-side only, like an answer.
  seed           text not null default encode(gen_random_bytes(16), 'hex'),
  -- Host's IANA zone. The weekly leaderboard resets Monday 00:00 here.
  timezone       text not null default 'UTC',
  created_at     timestamptz not null default now(),
  archived_at    timestamptz,
  constraint rooms_code_format  check (code ~ '^[2-9A-HJ-NP-Z]{4}$'),
  constraint rooms_name_length  check (char_length(btrim(name)) between 1 and 40),
  constraint rooms_capacity     check (max_players between 2 and 8)
);

-- ---------------------------------------------------------------------------
-- players — one row per person per room. The name is locked at creation.
-- ---------------------------------------------------------------------------
create table public.players (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.rooms (id) on delete cascade,
  -- Null only in the window between anonymous sign-in and the row being linked.
  auth_user_id uuid references auth.users (id) on delete set null,
  name         text not null,
  settings     jsonb not null
                 default '{"timerMode":"off","perPuzzleSeconds":180,"hardMode":false}'::jsonb,
  created_at   timestamptz not null default now(),
  constraint players_name_length check (char_length(btrim(name)) between 1 and 20)
);

-- Names are unique within a room, case-insensitively.
create unique index players_room_name_key on public.players (room_id, lower(name));
-- One seat per account per room.
create unique index players_room_auth_key on public.players (room_id, auth_user_id)
  where auth_user_id is not null;
create index players_auth_user_idx on public.players (auth_user_id);

alter table public.rooms
  add constraint rooms_host_player_fk
  foreign key (host_player_id) references public.players (id) on delete set null;

-- ---------------------------------------------------------------------------
-- puzzles — the materialised answer for (room, mode, number).
-- ---------------------------------------------------------------------------
create table public.puzzles (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms (id) on delete cascade,
  mode       int  not null,
  -- The room's puzzle counter for this mode, starting at 1.
  number     int  not null,
  -- SECRET. No client role is ever granted SELECT on this column.
  answer     text not null,
  created_at timestamptz not null default now(),
  unique (room_id, mode, number),
  constraint puzzles_mode_valid    check (mode in (5, 6, 7)),
  constraint puzzles_number_valid  check (number >= 1),
  constraint puzzles_answer_shape  check (answer ~ '^[a-z]+$' and char_length(answer) = mode)
);

comment on column public.puzzles.answer is
  'Server-side secret. Column-level SELECT is revoked from anon and authenticated.';

-- ---------------------------------------------------------------------------
-- attempts — one row per player per puzzle. Written server-side only.
-- ---------------------------------------------------------------------------
create table public.attempts (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references public.players (id) on delete cascade,
  puzzle_id   uuid not null references public.puzzles (id) on delete cascade,
  -- The words guessed. Visible to their author only: another player in the room
  -- reading these would be handed the answer to a puzzle they have not played.
  guesses     text[] not null default '{}',
  -- The colour grid, one 'correct'/'present'/'absent' row per guess. This is the
  -- spoiler-free projection the leaderboard renders, so the room may read it.
  marks       text[] not null default '{}',
  solved      boolean not null default false,
  guess_count int  not null default 0,
  elapsed_ms  int,
  timer_mode  text not null default 'off',
  hard_mode   boolean not null default false,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  unique (player_id, puzzle_id),
  constraint attempts_guess_count_valid  check (guess_count between 0 and 6),
  constraint attempts_guess_count_match  check (guess_count = coalesce(array_length(guesses, 1), 0)),
  constraint attempts_marks_match
    check (array_length(marks, 1) is not distinct from array_length(guesses, 1)),
  constraint attempts_timer_mode_valid
    check (timer_mode in ('off', 'per-puzzle', 'per-guess', 'sprint')),
  constraint attempts_elapsed_valid      check (elapsed_ms is null or elapsed_ms >= 0),
  -- A solve is only a solve once it has finished.
  constraint attempts_solved_finished    check (not solved or finished_at is not null)
);

create index attempts_puzzle_idx    on public.attempts (puzzle_id);
create index attempts_player_idx    on public.attempts (player_id);
create index attempts_finished_idx  on public.attempts (finished_at) where finished_at is not null;

-- ---------------------------------------------------------------------------
-- Scoring. Mirrors points() in packages/shared/src/points.ts - change both.
-- ---------------------------------------------------------------------------
create or replace function public.attempt_points(p_solved boolean, p_guess_count int)
returns int
language sql
immutable
as $$
  select case
           when p_solved and p_guess_count between 1 and 6 then 7 - p_guess_count
           else 0
         end;
$$;

comment on function public.attempt_points(boolean, int) is
  'Per-puzzle score: 7 - guesses on a solve, 0 on a fail. Time never adds points.';

-- ---------------------------------------------------------------------------
-- Invariants the API must not be able to talk its way out of.
-- ---------------------------------------------------------------------------

-- The display name is locked at creation. There is no rename path anywhere.
create or replace function public.reject_player_rename()
returns trigger
language plpgsql
as $$
begin
  if new.name is distinct from old.name then
    raise exception 'player names are locked and cannot be changed'
      using errcode = 'check_violation';
  end if;
  if new.room_id is distinct from old.room_id then
    raise exception 'players cannot move between rooms'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger players_name_locked
  before update on public.players
  for each row execute function public.reject_player_rename();

-- Capacity is enforced here, not in application code, so no join path can skip it.
create or replace function public.enforce_room_capacity()
returns trigger
language plpgsql
as $$
declare
  limit_players int;
  current_players int;
begin
  select max_players into limit_players
    from public.rooms where id = new.room_id
    for update;

  if limit_players is null then
    raise exception 'room % does not exist', new.room_id using errcode = 'foreign_key_violation';
  end if;

  select count(*) into current_players
    from public.players where room_id = new.room_id;

  if current_players >= limit_players then
    raise exception 'room is full (% of % players)', current_players, limit_players
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger players_room_capacity
  before insert on public.players
  for each row execute function public.enforce_room_capacity();
