# supabase

## Layout

- `migrations/` — schema, RLS, leaderboard views. Applied in filename order.
- `scripts/seed-word-bank.mjs` — generates `seed.sql` from `docs/wordlists/wordlists.json`.
- `seed.sql` — generated, git-ignored. `supabase db reset` runs it automatically.
- `functions/` — Edge Functions. Owned by workstream 5, not created here.

## Local

```bash
pnpm seed:wordbank        # docs/wordlists/wordlists.json -> supabase/seed.sql
supabase start
supabase db reset         # applies migrations, then seed.sql
```

## Remote

```bash
supabase link --project-ref <ref>
supabase db push
psql "$SUPABASE_DB_URL" -f supabase/seed.sql
```

## Deploying the edge functions

```bash
SUPABASE_ACCESS_TOKEN=sbp_... ./supabase/scripts/deploy-functions.sh
```

Do not call `supabase functions deploy` directly. The functions import
`@wordroom/shared` from `packages/shared/src`, which is outside
`supabase/functions` — deliberately, so the scoring rules exist once rather than
twice. The deploy bundler runs in a container that mounts only
`supabase/functions`, so that relative path escapes the mount and the bundle
fails with `Module not found`.

The script vendors the shared source into `supabase/functions/_vendor/` for the
length of one deploy, points `deno.json` at the copy, deploys, then restores
both. Nothing vendored is ever committed. Local `deno check`, `deno test` and
`supabase functions serve` need none of this — they read the real path.

Create the token at https://supabase.com/dashboard/account/tokens, scoped to
this project; **Edge Functions read-write is the only permission needed**.

## What a client may read

| Table | `anon` | `authenticated` |
|---|---|---|
| `word_bank` | nothing | nothing |
| `rooms` | nothing | own rooms, minus `seed` |
| `players` | nothing | players in own rooms; may update own `settings` only |
| `puzzles` | nothing | own rooms: `id, room_id, mode, number, created_at` — **never `answer`** |
| `attempts` | nothing | own rooms, minus `guesses`; own rows via `my_attempts` |

Prefer the answer-free views — `room_details`, `room_puzzles`, `my_attempts`,
`leaderboard_week`, `leaderboard_all` — over selecting the base tables, since
`select *` on `rooms`, `puzzles` or `attempts` hits a revoked column and fails.

Writes to `rooms`, `players`, `puzzles` and `attempts` are service-role only:
scoring a guess needs the answer, so it happens in an Edge Function.
