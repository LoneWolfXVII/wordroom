# End-to-end tests

Workstream 6. Playwright, driving the real app against the real Supabase
project — there is no fixture backend, because the things worth asserting here
are the ones only a real backend can get wrong: that a second browser can join
with a code, that two players get the same word, and that the answer is not on
the wire.

```bash
pnpm test:e2e                                   # everything
pnpm exec playwright test --project=mobile      # one viewport
pnpm exec playwright test e2e/security.spec.ts  # one spec
pnpm exec playwright show-report e2e/.report
```

Credentials come from `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` in the environment, or from `apps/web/.env.local`
— the same file the dev server reads. Without them **every spec skips** rather
than failing, which is what keeps CI green on a fork.

`E2E_PORT` moves the dev server off 3900 when something already has it. A stale
server on that port serves 404s for its chunks, the page never hydrates, and
every test fails for a reason that is not the app's.

## What is covered

| Spec | What it holds to account |
| --- | --- |
| `flows.spec.ts` | Create a room, read the code from the lobby, join from a second browser, both on puzzle No. 1 with the same word, one player advances while the other has not finished. Names are unique per room. |
| `game.spec.ts` | Solve and fail. The result sheet's guess count, share grid and "Next puzzle"; the revealed word on a fail; focus trap and Escape. An invalid word shakes and toasts **without consuming a row**. |
| `security.spec.ts` | The answer is in no response body and no websocket frame until this player has earned it. |
| `layout.spec.ts`, `layout-small.spec.ts` | No vertical scroll on the game screen at 375×667 and 360×640, on an empty board, a played board and a lost one. |
| `a11y.spec.ts` | A visible focus ring, and a sheet that traps focus and closes on Escape. |
| `reduced-motion.spec.ts` | The whole loop with `prefers-reduced-motion: reduce`, where every animation the app waits on collapses to zero. |

`flows`, `game`, `security`, `layout` and `a11y` run at both 375×667 and
1280×800.

## The security spec

`submit-guess` releases an answer only once an attempt is finished, and the
column grants say the same from underneath: `puzzles.answer` and
`attempts.guesses` have no grant for `authenticated`. `assertAnswerAbsent`
checks it server-side. This is the browser-side half.

Two things make it more than a formality:

- The expected answer is **known**, not guessed. A throwaway account plays the
  puzzle to the end first, which is the one sanctioned way a client is ever
  given an answer — no service-role key goes near the test runner.
- Another player in the room has **already solved that puzzle**, so a solved
  attempt whose last guess *is* the answer exists in `attempts` while the
  browser player is mid-puzzle. That is the row a realtime subscription would
  leak if `guesses` were ever granted.

It also asserts the check is not vacuous: after the player finishes, the same
recorder must find the answer. If it cannot, the assertion above proved nothing.

The app's own JavaScript bundles are excluded from the scan, on purpose. The
client legitimately ships the ten-thousand-word *guess* list, which contains the
answer alongside every other spellable word; finding it there reveals nothing.
What must never happen is the backend naming it.

## Accounts, rate limits and what a run leaves behind

A live Supabase project caps anonymous sign-ins at a few dozen per hour per IP,
and the app signs in on first load — so one browser context is one account.
A suite that hands every test a clean context spends the budget in about twenty
tests and then fails for reasons that have nothing to do with the app.

So accounts are named and reused: two browser players (`player`, `friend`) and
two out-of-band accounts (`host`, `rival`). Each is signed in once and cached in
`e2e/.cache/sessions.json`, outside git and outside Playwright's output
directory, so later runs cost nothing. Delete that file to start over. Tests are
still isolated where it matters: **every test gets a fresh room**, and one
account may hold a seat in many rooms.

The suite runs on **one worker** for the same reason — two workers do not share
the pool in memory, so both would miss the cache and both spend a sign-in.

**A run leaves rooms behind, permanently.** Rooms are named `E2E <label> <id>`,
one per test, and nothing in the suite can remove them: `grant all on
public.rooms` goes to `service_role` alone, `authenticated` has `select` only,
and none of the five Edge Functions archives a room. Every room brings its
players, puzzles and attempts with it. `e2e/.cache/created-rooms.log` records
each one.

Clearing them needs a key that bypasses RLS, which the runner deliberately does
not hold:

```bash
SUPABASE_SERVICE_ROLE_KEY=... node e2e/scripts/cleanup.mjs            # list
SUPABASE_SERVICE_ROLE_KEY=... node e2e/scripts/cleanup.mjs --delete   # remove
```

Rooms younger than `--older-than-hours` (default 2) are left alone, so a cleanup
cannot delete the rooms a concurrent run is still playing in. `players`,
`puzzles` and `attempts` all cascade from `rooms`.

## Selectors

The app ships no `data-testid`, so everything here is a role, a label or visible
copy. Two places where that is not enough, and the app already provides an
alternative:

- **The keyboard** exposes `data-key` (`data-key="enter"`, `data-key="back"`).
- **The board** exposes nothing at all — tiles are bare `<div>`s with no role,
  no `aria-*` and no data attribute — so `guessCount` counts tiles carrying
  `bg-correct` / `bg-present` / `bg-absent`, scoped to `<main>`. It works, and
  it is the one selector here that a Tailwind refactor could break silently.

## CI

`.github/workflows/ci.yml` runs the suite on pull requests only — every run
creates real rooms, so a second run on the merge commit would double the litter
for no extra signal. It skips cleanly when the secrets are absent:

| Secret | Required | For |
| --- | --- | --- |
| `E2E_SUPABASE_URL` | yes | the project URL |
| `E2E_SUPABASE_ANON_KEY` | yes | the anon / publishable key |
| `E2E_SUPABASE_SERVICE_ROLE_KEY` | no | `cleanup.mjs` after the run |

CI serves a production build rather than `next dev`: a dev server compiles a
route on its first request, and the first test to reach a screen would pay tens
of seconds that have nothing to do with the app.
