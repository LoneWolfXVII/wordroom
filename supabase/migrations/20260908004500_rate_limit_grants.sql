-- Close the rate limiter to clients.
--
-- 20260908001000_rate_limits.sql revoked `rate_limit_hit` and `prune_rate_limits`
-- from `public` and granted them to `service_role`, and read as if that made them
-- service-role only. It did not. Supabase's default privileges grant EXECUTE on
-- every new function in `public` to `anon` and `authenticated` directly, and a
-- revoke from `public` leaves a direct grant untouched. Probed against the live
-- project: an `authenticated` bearer could call
--
--   select * from rate_limit_hit('create-room:<victim auth uid>', 3600, 10)
--
-- eleven times and the victim's next create-room came back 429 for an hour.
-- `players.auth_user_id` is visible to everyone in a room, so any room-mate could
-- do this to any other, for `submit-guess` (a minute of no guesses, renewable)
-- as much as for `create-room`. The function is SECURITY DEFINER, which is what
-- made the call succeed despite `rate_limits` itself being unreadable.
--
-- The fix is the revoke that was meant: name the roles. `guess_context` in
-- 20260908003000 already does this and is not reachable, which is how the two
-- were told apart.

revoke execute on function public.rate_limit_hit(text, int, int) from anon, authenticated;
revoke execute on function public.prune_rate_limits(interval) from anon, authenticated;

-- Stop the next function from starting out world-callable. This alters the
-- defaults for objects created by the migration role from here on; functions
-- that must be callable by clients are granted explicitly, as `is_room_member`
-- and `is_puzzle_member` already are.
alter default privileges in schema public revoke execute on functions from anon, authenticated;
