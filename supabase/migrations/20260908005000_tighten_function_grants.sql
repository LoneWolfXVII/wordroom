-- Close the rest of the over-granted functions.
--
-- `20260908004500_rate_limit_grants.sql` fixed the rate limiter and stopped
-- *future* functions starting out world-callable. It did not revisit the
-- functions that already existed, and an audit of `has_function_privilege` over
-- every routine in `public` found the same mistake in three more places.
--
-- The mistake, in one line: `revoke all ... from public` does not remove a grant
-- made to `anon` or `authenticated` directly, and Supabase's default privileges
-- make exactly those grants. Every earlier migration that wrote
-- "revoke from public" believed it was starting from nothing and was not.
--
-- Severity here is low — none of these leaks anything on its own — but they are
-- the same latent class as the rate limiter, which was not low, and a
-- SECURITY DEFINER function reachable by a role that should never call it is
-- worth closing while it is still harmless.

-- The membership helpers are SECURITY DEFINER: they read `players` with RLS
-- bypassed so an RLS policy can ask "is the caller in this room?" without the
-- caller needing to read the table that answers it.
--
-- `authenticated` must keep EXECUTE — policies are evaluated as the querying
-- role, so revoking it would break every read in the app. `anon` never should
-- have had it. It returns false for an anonymous caller either way, since
-- `auth.uid()` is null, so this closes the reach rather than a leak.
revoke execute on function public.is_room_member(uuid)   from anon;
revoke execute on function public.is_puzzle_member(uuid) from anon;

-- Trigger functions. Postgres calls these through the trigger, which does not
-- consult EXECUTE at all, so no grant is needed by anyone. Called directly they
-- would fail on the missing trigger context — but "it errors" is not a reason to
-- leave them callable.
revoke execute on function public.reject_player_rename()  from anon, authenticated;
revoke execute on function public.enforce_room_capacity() from anon, authenticated;

-- `attempt_points` is deliberately left alone: it is a pure, immutable
-- arithmetic function with no table access, the leaderboard views compute with
-- it, and it is granted to `authenticated` on purpose.
