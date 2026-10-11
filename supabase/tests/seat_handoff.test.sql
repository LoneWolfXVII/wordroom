-- The seat handoff, end to end, in one rolled-back transaction.
-- Run: psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/seat_handoff.test.sql
begin;

-- A guest in rooms A and B; an account already in room B; a second guest.
insert into auth.users (id, is_anonymous) values
  ('00000000-0000-0000-0000-00000000000a', true),
  ('00000000-0000-0000-0000-00000000000b', false),
  ('00000000-0000-0000-0000-00000000000c', true);
insert into public.rooms (id, code, name) values
  ('10000000-0000-0000-0000-00000000000a', 'TSTA', 'A'),
  ('10000000-0000-0000-0000-00000000000b', 'TSTB', 'B');
insert into public.players (room_id, auth_user_id, name) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'Guest'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a', 'Guest'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'Account');

create temp table t (token uuid, result jsonb);
grant all on t to authenticated;

set local role authenticated;

-- A real account cannot start a handoff.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
do $$ begin
  assert public.begin_seat_handoff() ? 'error', 'an account must not begin a handoff';
end $$;

-- The guest can, and cannot read the table behind it.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
insert into t (token) select (public.begin_seat_handoff() ->> 'token')::uuid;
do $$ begin
  assert (select token from t) is not null, 'the guest gets a token';
  begin
    perform 1 from public.seat_handoffs;
    assert false, 'seat_handoffs must not be readable by a client';
  exception when insufficient_privilege then null;
  end;
  -- Nor can a guest redeem it for itself.
  assert public.claim_seat_handoff((select token from t)) ? 'error', 'a guest must not claim';
end $$;

-- The account redeems it: room A moves, room B (already the account's) stays.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
update t set result = public.claim_seat_handoff(token);
do $$ begin
  assert (select result from t) = '{"moved":1,"kept":1}'::jsonb,
    format('expected moved 1 kept 1, got %s', (select result from t));
  -- Single use: a second claim moves nothing.
  assert public.claim_seat_handoff((select token from t)) = '{"moved":0,"kept":0}'::jsonb,
    'a token works once';
  assert public.claim_seat_handoff(gen_random_uuid()) = '{"moved":0,"kept":0}'::jsonb,
    'an unknown token moves nothing';
end $$;

reset role;
do $$ begin
  assert (select auth_user_id from public.players
           where room_id = '10000000-0000-0000-0000-00000000000a')
         = '00000000-0000-0000-0000-00000000000b', 'room A now belongs to the account';
  assert (select count(*) from public.players
           where room_id = '10000000-0000-0000-0000-00000000000b') = 2,
         'room B keeps both seats';
end $$;

-- An expired token moves nothing.
insert into public.seat_handoffs (token, guest_id, expires_at) values
  ('20000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000c', now() - interval '1 minute');
insert into public.players (room_id, auth_user_id, name) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', 'Late');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
do $$ begin
  assert public.claim_seat_handoff('20000000-0000-0000-0000-00000000000c')
         = '{"moved":0,"kept":0}'::jsonb, 'an expired token moves nothing';
end $$;

reset role;
select 'seat handoff: all assertions passed' as result;
rollback;
