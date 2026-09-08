# Wordroom

Play word puzzles with a specific group of friends. Unlimited puzzles per room,
one seeded sequence per mode, one leaderboard.

Specs live in `docs/`: `wordroom-spec-v1.md` (what and why),
`wordroom-build-plan.md` (how, and the workstream split),
`wordroom-screens.html` (the visual prototype — the source of truth for design).

Never write "Wordle" in product copy, marketing, page titles or share text. It is
an NYT trademark. In code comments, referring to the mechanic is fine.

---

## The one rule: answers never reach the client

A puzzle answer is a server-side secret until that player has solved, failed, or
revealed it. Everything below follows from that.

- `puzzles.answer` and `rooms.seed` have **no column grant** for `anon` or
  `authenticated`. A `select *` on those tables fails for a client. Use the
  answer-free views: `room_details`, `room_puzzles`, `my_attempts`.
- `word_bank` has no grant and no policy at all. Clients cannot read it, ever.
- Guesses are validated and scored in the `submit-guess` Edge Function, which
  returns **marks only** — `correct` / `present` / `absent` per tile.
- The client's copy of the word list is the **guess** list, for spelling checks.
  It is never the answer list. Do not ship `word_bank` contents to the browser,
  and do not put answers in a service worker cache.
- `PuzzleSecret` in `@wordroom/shared` is the only type carrying an answer. It is
  server-only. `Puzzle` is what a handler may return.
- `attempts.guesses` is revoked from the room, because a solved attempt's last
  guess *is* the answer. The room sees `attempts.marks`.
- CI greps for `.answer` in `apps/web`. If a line genuinely needs it (the reveal
  path), mark it `// answers-ok: <why>`.

If a change makes an answer easier to reach, it is wrong, however convenient.

---

## Repo layout and who owns what

Workstreams run in parallel on their own branches. Stay inside your folder;
changes to a folder you do not own go through the owner.

| Path | Workstream | Owns |
|---|---|---|
| `packages/shared` | **0 — contract** | Domain types, `scoreGuess`, `isHardModeValid`, `points`, `computeStats`, their tests |
| `supabase/migrations`, `supabase/scripts` | **0 — contract** | Schema, RLS, grants, leaderboard views, word-bank seed |
| `CLAUDE.md`, root config, `.github/workflows` | **0 — contract** | Tooling, CI, this file |
| `apps/web/app`, `apps/web/components/ui` | **1 — design system + shell** | Tokens, layout shell, sheet/toast/segmented/switch/code boxes, `/dev/ds` |
| `apps/web/features/game` | **2 — game engine + board** | Game store, board, keyboard, animations, result sheet, share text |
| `apps/web/features/rooms`, `apps/web/app/(onboarding)` | **3 — rooms + identity** | Home, create, join, name lock, lobby, anonymous auth, identity linking |
| `apps/web/features/leaderboard`, `apps/web/features/settings` | **4 — leaderboard + settings** | Realtime board, FLIP reorder, stats tab, settings sheet |
| `supabase/functions` | **5 — backend functions** | `create-room`, `join-room`, `get-puzzle`, `submit-guess`, `reveal` |
| `e2e/`, PWA assets, deploy config | **6 — quality + ship** | Playwright, Lighthouse, manifest, OG image, domain |

`packages/shared` is the contract between all of them. Adding to it is cheap;
changing an existing signature is not — say so in the PR.

---

## Design tokens

Copied verbatim from the `:root` block of `docs/wordroom-screens.html`. That file
is the source of truth: change it first, then mirror the hex here and in
`apps/web/app/globals.css`. Light mode only in v1 — there is no dark variant.

### Colour

| Token | Tailwind | Hex | Use |
|---|---|---|---|
| `--bg` | `bg-bg` | `#F5F1EA` | Page background, warm white |
| `--surface` | `bg-surface` | `#FBF9F5` | Cards, inputs, unfilled tiles |
| `--surface-2` | `bg-surface-2` | `#EFEAE1` | Pressed states, segmented track, muted bars |
| `--ink` | `text-ink` | `#1F1C18` | Primary text |
| `--ink-2` | `text-ink-2` | `#5C554C` | Secondary text, icon buttons |
| `--muted` | `text-muted` | `#8A8177` | Captions, hints, inactive segments |
| `--line` | `border-line` | `#E3DCD0` | Default borders |
| `--line-2` | `border-line-2` | `#CFC6B8` | Filled-tile and filled-code borders |
| `--accent` | `bg-accent` | `#2F5D62` | Primary button, focus ring, notification dot |
| `--accent-soft` | `bg-accent-soft` | `#E4ECEC` | Focus glow behind inputs |
| `--on-accent` | `text-on-accent` | `#F5F1EA` | Text on accent |
| — | `bg-accent-pressed` | `#264D51` | Primary button `:active` |
| `--correct` | `bg-correct` | `#5B8C5A` | Correct tile, today's distribution bar |
| `--present` | `bg-present` | `#C9A227` | Present tile |
| `--absent` | `bg-absent` | `#A9A196` | Absent tile |
| `--key` | `bg-key` | `#EAE4DA` | Unused keyboard key |
| — | `bg-key-pressed` | `#DED6C9` | Key `:active` |
| `--on-tile` | `text-on-tile` | `#F5F1EA` | Text on a coloured tile |
| — | `text-danger` | `#A24B3A` | Leave room, "name taken". Used inline in the prototype but absent from its `:root`; tokenised here so it is not hardcoded four times. |

The Rules page must name these three swatches exactly as the tiles do: correct,
present, absent.

### Radius, elevation, metrics

| Token | Tailwind | Value |
|---|---|---|
| `--r-s` | `rounded-sm` | `6px` — tiles, keys |
| `--r-m` | `rounded-md` | `10px` — buttons, inputs, icon buttons |
| `--r-l` | `rounded-lg` | `18px` — cards, sheets |
| `--sh-1` | `shadow-sm` | `0 1px 2px rgba(31,28,24,.06)` |
| `--sh-2` | `shadow-md` | `0 8px 24px -8px rgba(31,28,24,.18)` |
| `--sh-3` | `shadow-lg` | `0 24px 48px -16px rgba(31,28,24,.28)` |
| `--tile` | `--size-tile` | `56px` |
| `--gap` | `--size-gap` | `6px` |
| — | `--breakpoint-panel` | `820px` — at or above this, sheets render as a fixed right panel |

### Motion

| Token | Value | For |
|---|---|---|
| `--d-micro` | `120ms` | Press, hover, tile pop |
| `--d-state` | `200ms` | Colour and border changes |
| `--d-struct` | `350ms` | Sheets, screen transitions, board swap |
| `--d-reveal` | `600ms` | Row flip, 70ms stagger between tiles |
| `--e-out` | `cubic-bezier(.2,.8,.2,1)` | Entering |
| `--e-in` | `cubic-bezier(.4,0,1,1)` | Leaving |
| `--e-spring` | `cubic-bezier(.34,1.4,.64,1)` | Overshoot: bounce, segmented indicator |

Motion answers an action. Only the row reveal and the result moment animate
unprompted. Nothing exceeds 600ms. Every animation needs a reduced-motion
fallback — `globals.css` ships a global one; do not defeat it.

### Type and icons

Geist, one family, via `next/font`, wired to `--font-sans`. Tabular numerals
(`.tabular`) on every number, code, timer and score. Icons: Hugeicons free,
Stroke Rounded, 18–20px at stroke 1.6. Morphicons for state toggles. Not Lucide.

No cartoon illustration, no confetti, no gradients.

---

## Rules that are easy to get wrong

- **Names are locked.** Chosen on join, unique per room case-insensitively,
  confirmed once. There is no rename path in the UI, the API, or the database —
  a trigger rejects it.
- **Scoring.** `points(guesses, solved)` = `7 - guesses` on a solve, `0` on a
  fail. Time only breaks ties; it never adds points. The SQL twin is
  `public.attempt_points()` — change both together.
- **Streaks** are consecutive puzzle *numbers* solved within one mode. A fail
  breaks it and so does a skip. Modes never interact.
- **Sheets become a right panel at `--breakpoint-panel` (820px)**, per the spec.
  The prototype shows a centred 520px card there instead; the spec wins.
- **Room codes** are 4 characters from A–Z and 2–9, minus `0`/`O` and `1`/`I`.
  `CODE_ALPHABET` in `@wordroom/shared` and the `rooms_code_format` constraint
  both encode this. **Open question:** the spec says "4-letter code (A–Z minus O
  and I)" but the build plan says "codes exclude 0/O/1/I" and its share example
  is `KHX7`. The alphabet above is the superset, so it validates either policy —
  narrow it in both places if letters-only wins.
- **Capacity is 8**, enforced by a trigger, not by application code.
- **Weekly boards reset Monday 00:00 in the room's timezone**, from
  `rooms.timezone`. All-time persists.
- **An invalid word is not a guess.** Shake and toast; the row is not consumed.
- **Hard mode** rejects a guess that moves a revealed green or drops a revealed
  yellow, with a specific message. Letters known to be absent stay legal.
- **No one waits.** Each player advances to the next puzzle independently; the
  board compares per puzzle number.

---

## Commands

```bash
pnpm install
pnpm dev              # apps/web on :3000
pnpm typecheck        # tsc --noEmit across the workspace
pnpm test             # vitest
pnpm lint             # biome check
pnpm format           # biome check --write
pnpm build            # next build
pnpm seed:wordbank    # docs/wordlists/wordlists.json -> supabase/seed.sql
```

Pre-commit runs `pnpm typecheck && pnpm test`. CI additionally lints, builds,
validates the word lists, and greps for leaked answers.

## Conventions

- TypeScript strict, plus `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`. Index access is `T | undefined` — handle it.
- Biome, single quotes, no semicolons, 100 columns. Do not add Prettier or ESLint.
- Domain logic that both the app and an Edge Function need lives in
  `packages/shared` and has a Vitest test. Pure functions, no I/O.
- Mobile first. The game screen must fit 375×667 with no vertical scroll.
