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
