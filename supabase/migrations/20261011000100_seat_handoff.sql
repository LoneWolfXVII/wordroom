-- Signing in keeps the rooms you played as a guest.
--
-- Signing in to an account replaces the anonymous user, and `players` points at
-- the anonymous user's id, so the guest's seats used to stay behind with it.
-- Linking the new identity onto the guest avoided that, but only for an account
-- that did not exist yet; a returning player hit "that account is already in
-- use" and had to sign in a second time, leaving their guest rooms behind.
--
-- So the seats move instead. Before leaving for the provider, the guest asks for
-- a handoff token, and keeps it in the browser. Once signed in, the account
-- redeems it and the guest's seats become the account's. Holding the token is
-- the proof of owning the guest: it never leaves the device the guest lives on,
-- which is exactly the trust the guest's own session already has.
--
-- A room both sides already sit in keeps the account's seat. Names are locked
-- and a room holds one seat per account, so the guest's seat there stays with
-- the guest rather than being merged or dropped.
-- ---------------------------------------------------------------------------

create table public.seat_handoffs (
  token      uuid primary key default gen_random_uuid(),
  -- One outstanding handoff per guest; asking again replaces it.
  guest_id   uuid not null unique references auth.users (id) on delete cascade,
  -- Long enough to read an emailed link the next morning.
  expires_at timestamptz not null default now() + interval '1 day'
);

alter table public.seat_handoffs enable row level security;
-- No policy, and no grant: only the two functions below touch this table.
revoke all on public.seat_handoffs from public, anon, authenticated;
grant all on public.seat_handoffs to service_role;

-- ---------------------------------------------------------------------------
-- begin_seat_handoff — called by the guest, just before signing in.
-- ---------------------------------------------------------------------------
create or replace function public.begin_seat_handoff()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_user  uuid := auth.uid();
  v_token uuid;
begin
  -- Only a guest has seats to hand over. A real account keeps its own.
  if v_user is null or not exists (
    select 1 from auth.users where id = v_user and is_anonymous
  ) then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'not_a_guest', 'message', 'Only a guest can hand over rooms.'));
  end if;

  delete from public.seat_handoffs where guest_id = v_user or expires_at < now();
  insert into public.seat_handoffs (guest_id) values (v_user) returning token into v_token;

  return jsonb_build_object('token', v_token);
end;
$$;

-- ---------------------------------------------------------------------------
-- claim_seat_handoff — called by the account, once signed in.
--
-- Redeeming is single-use (the row is deleted as it is read), and an unknown or
-- expired token moves nothing rather than erroring, so a retry after a dropped
-- response is harmless.
-- ---------------------------------------------------------------------------
create or replace function public.claim_seat_handoff(p_token uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_user  uuid := auth.uid();
  v_guest uuid;
  v_moved int := 0;
  v_kept  int := 0;
begin
  if v_user is null or exists (
    select 1 from auth.users where id = v_user and is_anonymous
  ) then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'not_signed_in', 'message', 'Sign in first.'));
  end if;

  delete from public.seat_handoffs
   where token = p_token and expires_at > now()
  returning guest_id into v_guest;

  -- The guest must still be a guest. If it has since become a real account, its
  -- seats are that account's to keep.
  if v_guest is null or v_guest = v_user or not exists (
    select 1 from auth.users where id = v_guest and is_anonymous
  ) then
    return jsonb_build_object('moved', 0, 'kept', 0);
  end if;

  update public.players p
     set auth_user_id = v_user
   where p.auth_user_id = v_guest
     and not exists (
       select 1 from public.players q where q.room_id = p.room_id and q.auth_user_id = v_user
     );
  get diagnostics v_moved = row_count;

  select count(*) into v_kept from public.players where auth_user_id = v_guest;

  return jsonb_build_object('moved', v_moved, 'kept', v_kept);
end;
$$;

revoke all on function public.begin_seat_handoff() from public, anon;
revoke all on function public.claim_seat_handoff(uuid) from public, anon;
grant execute on function public.begin_seat_handoff() to authenticated;
grant execute on function public.claim_seat_handoff(uuid) to authenticated;

comment on table public.seat_handoffs is
  'One-time tokens that move a guest''s seats to the account it signs in as. No client grant.';
