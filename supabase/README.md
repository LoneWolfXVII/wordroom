# supabase

## Layout

- `migrations/` — schema, RLS, leaderboard views. Applied in filename order.
- `scripts/seed-word-bank.mjs` — generates `seed.sql` from `docs/wordlists/wordlists.json`.
- `seed.sql` — generated, git-ignored. `supabase db reset` runs it automatically.
- `functions/` — Edge Functions. Owned by workstream 5, not created here.

## Local

**Development and tests use a local database. Production is for players.**

```bash
pnpm seed:wordbank                          # answers    -> supabase/seed.sql
node supabase/scripts/seed-guess-bank.mjs   # dictionary -> supabase/seed-guesses.sql
supabase start                              # Postgres, auth, PostgREST, realtime
supabase db reset                           # migrations, then both seeds
./supabase/scripts/serve-functions.sh       # the Edge Functions
pnpm dev                                    # apps/web on :3900
```

`config.toml` seeds both word tables and turns on anonymous sign-ins and manual
linking, so local behaves like production. `apps/web/.env.local` points at
`127.0.0.1:54321`; production credentials live in `.env.production.local` and
only `pnpm dev:prod` reads them.

`serve-functions.sh` is not optional. The Edge Runtime container mounts only
`supabase/functions`, so the import of `packages/shared` cannot resolve from
inside it and every function answers `BOOT_ERROR`. The script vendors the shared
source for the length of the command, exactly as the deploy script does.

Why bother, rather than pointing at the hosted project:

- Anonymous sign-ins are capped at **30/hour/IP** there. A test run exhausted it
  and then failed for a reason that looked nothing like the cap.
- Test rooms cannot be removed by a client — `rooms` grants `authenticated` only
  `select` — so every run left rooms behind permanently.
- `supabase db reset` rebuilds from migrations in one command.

Two word tables, and the difference matters:

- `word_bank` — the **answers**. No client role may read it, ever.
- `guess_bank` — the **dictionary** of ~47,000 typeable words, used by
  `submit-guess` to reject letter soup. Not secret (the browser ships the same
  list) but revoked from clients anyway, since they have their own copy.

The dictionary used to be compiled into the function. It was the bulk of a
1.7MB bundle, and every cold start paid to parse 47,000 words — the first guess
after an idle period took ~5s against ~0.7s warm. Moving it into
`guess_context` costs no extra round trip and brought cold starts to ~1s.

## Remote

```bash
supabase link --project-ref <ref>
supabase db push
psql "$SUPABASE_DB_URL" -f supabase/seed.sql
```

## Applying any of this

**Nothing here goes through git.** A migration run in the SQL editor and a
function deploy both change the live system the moment they run — no branch, no
review, no rollback. Migrations are applied by the operator, not automatically,
and a schema change plus the code that needs it should ship together. See
"Never change production directly" in `CLAUDE.md`.

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
