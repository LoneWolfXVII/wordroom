# Edge Functions

Workstream 5. Six Deno functions: `create-room`, `join-room`, `leave-room`, `get-puzzle`,
`submit-guess`, `reveal`.

## The rule these functions exist to enforce

A puzzle answer is a server-side secret. It leaves the server in exactly two places, both of them
deliberate:

- `submit-guess`, once the attempt is **finished** — solved, out of guesses, or timed out.
- `reveal`, for an attempt that is **already finished**.

Everywhere else the response carries marks (`correct` / `present` / `absent`) and nothing more.
Response bodies are built field by field in `_shared/presenters.ts`; nothing spreads a database row
into a response, because a spread is how `answer` and `seed` escape the day someone adds a column.
Every answer-free body is additionally checked against the answer before it is sent
(`assertAnswerAbsent`), so a mistake becomes a 500 here rather than a spoiler in someone's network
tab.

`_tests/no-answer-leak.test.ts` is the unit-level twin of the Playwright assertion workstream 6
adds.

## Why these run as `service_role`

Scoring a guess needs `puzzles.answer`, and no client role has a grant on that column. So the
functions use the service role key — which **bypasses RLS**. Authorisation is therefore this code's
job, not Postgres's, and every handler that touches room data calls both halves:

1. `requireCaller` — the bearer token is a real, unexpired Supabase JWT.
2. `requireMembership` — that user has a `players` row in the room in question.

A caller who is not a member gets the same answer as one asking about a room that does not exist, so
room ids cannot be probed.

## Environment

| Variable                    | Where from                      | Required                            |
| --------------------------- | ------------------------------- | ----------------------------------- |
| `SUPABASE_URL`              | injected by the platform        | yes                                 |
| `SUPABASE_SERVICE_ROLE_KEY` | injected by the platform        | yes                                 |
| `SUPABASE_ANON_KEY`         | injected by the platform        | yes (falls back to the service key) |
| `WORDROOM_ALLOWED_ORIGINS`  | set with `supabase secrets set` | no — defaults to `*`                |

The three `SUPABASE_*` values are provided automatically in both `supabase
functions serve` and the
deployed runtime; you never set them yourself (the platform rejects user secrets with that prefix).
`WORDROOM_ALLOWED_ORIGINS` is a comma-separated origin list — set it in production; every function
requires a JWT regardless, so `*` is fine locally.

## Local

```bash
supabase start
pnpm seed:wordbank && supabase db reset   # word_bank must have rows
supabase functions serve                  # all six on :54321/functions/v1/<name>
```

Every endpoint is `POST` and needs a user access token. Get one the way the app does —
`supabase.auth.signInAnonymously()` — or over REST:

```bash
ANON=$(supabase status -o env | grep ANON_KEY | cut -d= -f2 | tr -d '"')
JWT=$(curl -s -X POST 'http://127.0.0.1:54321/auth/v1/signup' \
        -H "apikey: $ANON" -H 'content-type: application/json' \
        -d '{}' | jq -r .access_token)

curl -s -X POST 'http://127.0.0.1:54321/functions/v1/create-room' \
  -H "Authorization: Bearer $JWT" -H "apikey: $ANON" \
  -H 'content-type: application/json' \
  -d '{"roomName":"Friday Crew","playerName":"Nisc","timezone":"Europe/London"}'
```

## Checks

```bash
cd supabase/functions
deno task check          # type check
deno task test           # 72 unit tests
deno lint
deno task build:guesses  # regenerate the guess lists from docs/wordlists
```

`pnpm typecheck` and `pnpm lint` from the repo root cover this folder too — Biome lints and formats
these files, so they follow the repo's style (single quotes, no semicolons, 100 columns), not
`deno fmt` defaults.

---

## API

Every response is JSON. Failures share one envelope:

```json
{ "error": { "code": "room_full", "message": "This room is full.", "details": {} } }
```

`code` is stable and switchable; `message` is shown to the player. Raw Postgres text never reaches
the client — `_shared/errors.ts` maps constraint violations to these codes.

Common codes: `bad_request` (400), `unauthorized` (401), `not_a_member` (403), `rate_limited` (429),
`internal` (500).

### `create-room`

```
POST { roomName: string(1..40), playerName: string(1..20), timezone?: IANA zone }
 201 { room: Room, player: Player }
```

Generates a 4-character code from `CODE_ALPHABET` with `crypto.getRandomValues`, retrying up to 8
times on the unique index. Creates the room, seats the caller as the host player, and points
`rooms.host_player_id` at them. `timezone` defaults to `UTC` and decides when the weekly leaderboard
rolls over. If seating the host fails, the room is deleted again rather than left holding a code.

Errors: `invalid_timezone` (400, as `bad_request`), `code_unavailable` (409). Rate limit: 10 per
hour per user.

### `join-room`

```
POST { code: string(4), playerName: string(1..20) }
 200 { room: Room, player: Player }
```

The code is uppercased and trimmed before lookup. Capacity, case-insensitive name uniqueness and
one-seat-per-account are all decided by the database — a trigger and two unique indexes — and this
function translates the rejection. Pre-checking them in application code would be a race.

Re-joining with the same name returns the existing player row unchanged, so a double tap or a second
device is harmless.

Errors: `room_not_found` (404), `room_archived` (409), `room_full` (409), `name_taken` (409),
`already_joined` (409, when the account is in the room under a different name — names are locked, so
there is no way to change it). Rate limit: 30 per hour per user.

### `leave-room`

```
POST { roomId: uuid }
 200 { roomId, playerId, playerName, wasHost }
```

**Leaving is a hard leave.** The `players` row is deleted, and what hangs off it goes with it — that
is the semantics, not a side effect:

- `attempts.player_id` is `on delete cascade`, so the leaver's scores in this room are gone rather
  than sitting on the leaderboard as a ghost;
- `players_room_name_key` is a unique index, so the locked name is freed for someone else;
- `enforce_room_capacity` counts rows, so the seat is genuinely free again;
- `rooms_host_player_fk` is `on delete set null`, so a departing host leaves the room hostless
  rather than taking it down. `wasHost` says that just happened.

The alternative — a `left_at` flag — keeps a name nobody can reuse and a leaderboard entry for
someone who is not here. It is not what "leave" means. Because this is irreversible, the client
confirms it first, naming what is lost and what is freed.

This cannot be done over REST: `authenticated` has no delete grant on `players`, deliberately. So it
is a `service_role` function, and the membership check is doing the authorisation Postgres would
otherwise do. A caller with no seat in the room and a caller naming a room that does not exist both
get `not_a_member`, so room ids cannot be probed.

Rejoining afterwards is a normal `join-room`, and the name is available again — to them or to anyone
else.

Errors: `not_a_member` (403). Rate limit: 20 per hour per user.

### `get-puzzle`

```
POST { roomId: uuid, mode: 5|6|7, number: int >= 1 }
 200 { puzzle: { id, roomId, mode, number } }
```

Returns the `Puzzle` type from `@wordroom/shared`, which has no `answer` field to put one in. On
first request the answer is derived and written to `puzzles`:

```
index  = sha256(`${room.seed}|${mode}|${number}`) mod count(word_bank[mode])
answer = word_bank[mode] ordered by rank, at that index
```

Deterministic, so the same room + mode + number always yields the same word, for every player and
across restarts. Two concurrent first requests derive the same word and one loses the insert race
harmlessly.

A number more than one past the room's highest is refused, so a single player cannot mine the
sequence far ahead of the room. Going _back_ to a number the room has already reached is allowed —
players advance independently.

Errors: `puzzle_out_of_sequence` (422, with `details: { reached, next }`), `room_not_found` (404),
`room_archived` (409), `word_bank_empty` (500).

### `submit-guess`

```
POST { puzzleId: uuid, guess: string, elapsedMs?: int }
POST { puzzleId: uuid, timedOut: true, elapsedMs?: int }
 200 GuessResultBody
```

```ts
interface GuessResultBody {
  attemptId: string
  puzzleId: string
  marks: ('correct' | 'present' | 'absent')[] | null // null for a timeout
  guessCount: number
  guessesRemaining: number
  solved: boolean
  finished: boolean
  // present only when finished === true
  answer?: string
  points?: number
  finishedAt?: string
  elapsedMs?: number | null
}
```

Order of business: rate limit, verify the caller, verify membership, load the attempt, then validate
— length, real word, hard mode — and only then score with `scoreGuess()` and write.

- **An invalid word is not a guess.** `not_a_word` and `hard_mode_violation` are returned _before
  anything is written_, so the row is not consumed. Same for `wrong_length`.
- **Hard mode** is applied when the attempt has it on. `hard_mode` and `timer_mode` are snapshotted
  onto the attempt from `players.settings` when the attempt is opened, so changing a setting cannot
  change the rules of a puzzle already in play — settings apply from the next puzzle, per the spec.
  The rejection message comes from `isHardModeValid()` and names only letters the player has already
  revealed to themselves.
- **The attempt row is created on the first accepted guess**, not when the puzzle is fetched, so an
  unplayed puzzle never shows up in a player's stats.
- **Concurrent guesses** cannot overwrite each other: the update is conditional on `guess_count` and
  on the attempt still being open. The loser gets `guess_in_flight` (409) and retries.
- **A timeout** finishes the attempt as a fail (0 points) and unlocks the answer. Sending it twice
  returns the same body rather than erroring.

Errors: `not_a_word` (422), `wrong_length` (422), `hard_mode_violation` (422, with
`details: { reason: 'position' | 'missing' }`), `attempt_finished` (409), `guess_in_flight` (409),
`puzzle_not_found` (404). Rate limit: 60 per minute per user.

### `reveal`

```
POST { attemptId: uuid } | { puzzleId: uuid }
 200 RevealBody
```

```ts
interface RevealBody {
  attemptId: string
  puzzleId: string
  mode: 5 | 6 | 7
  number: number
  answer: string
  solved: boolean
  guessCount: number
  guesses: string[]
  marks: ('correct' | 'present' | 'absent')[][]
  points: number
  elapsedMs: number | null
  finishedAt: string
}
```

This is the result sheet re-opening after a reload, not a give-up button. Two refusals matter: the
attempt must be finished (`attempt_not_finished`, 409), and it must be the caller's own — another
player's finished attempt would hand you the answer to a puzzle you have not played, which is why
`attempts.guesses` is revoked from the room. Someone else's attempt returns `attempt_not_found`
(404), the same as one that does not exist.

---

## Notes for the other workstreams

### `attempts.marks` format

The column is `text[]` with a constraint that its length matches `guesses`, so one element is one
_row_ of the colour grid. This code writes the `Mark` names, comma separated, in guess order:

```
'correct,present,absent,absent,correct'
```

Compact single letters would be smaller, but three other workstreams read this column and there is
no decoder in `@wordroom/shared` for them to import — a self-describing value cannot be misread.
`_shared/marks.ts` is the reference implementation, and moving `encodeMarkRow` / `decodeMarkRow`
into `packages/shared` would be a cheap addition to the contract.

### `@wordroom/shared` under Deno

Consumed straight from source. No build step, no copy, no fork — `scoreGuess`, `isHardModeValid` and
`points` have exactly one definition each.

`packages/shared` imports its own modules with explicit `.js` specifiers, which Deno resolves
literally. `deno.json` remaps each one to its `.ts` twin. Relative import-map keys normalise against
`deno.json` and the specifiers inside `index.ts` normalise against `packages/shared/src`, to the
same URL, so they match. This is exact and stable; `--sloppy-imports` would be the alternative, but
it is an unstable flag the deployed runtime is not guaranteed to honour.

**Deploy caveat.** `packages/shared` sits outside `supabase/functions`. The Docker/eszip bundler
(`supabase functions deploy`, the default) follows relative file imports outside the functions
directory and bundles them. A bundle-less, API-based upload path would only send files under
`supabase/functions` and would fail to resolve them. If that path is ever adopted, the fix is a
pre-deploy vendor step — copy `packages/shared/src` into `_shared/` and repoint the one import-map
entry — which is a copy made at deploy time, not a second copy in git. Flagged for workstream 6,
which owns deploy config.

The CLI picks up `supabase/functions/deno.json` as the import map automatically. If a CLI version
ever needs it stated explicitly, that is a `[functions]` entry in `supabase/config.toml`, which this
workstream does not own.

### The guess list

`word_bank` holds **answers only**, on purpose — it is the table nobody may read. The guess list is
a spelling dictionary, not a secret: the browser ships the same words. It is embedded in
`_shared/guess-list/` (generated from `docs/wordlists/wordlists.json` by `deno task build:guesses`)
so the check stays in-process on the hot path and the deploy needs no second seed step.

The server check is the authority, not a duplicate of the client's courtesy check. Without it a
player could spend guesses on strings like `aeiou`, which carry more information than any real word,
and the six-guess budget would stop meaning the same thing for everyone.

### Added migration

`supabase/migrations/20260908001000_rate_limits.sql` — a `rate_limits` table and the
`rate_limit_hit(key, window_seconds, max_hits)` RPC, service-role only, no grants for `anon` or
`authenticated`. The counter lives in Postgres because Edge Functions run in many short-lived
isolates, and an in-memory counter would hand an attacker a fresh budget on every cold start. It
fails open: a broken limiter must not take the game down.

No existing migration was modified.
