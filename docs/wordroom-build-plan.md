# Wordroom — Build plan

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router), TypeScript strict | SSR for share pages, edge-friendly, Vercel-native |
| Styling | Tailwind v4 + shadcn/ui (Sheet, Drawer via Vaul, Toggle, RadioGroup, Toast) | Tokens from the prototype go into `@theme`; shadcn only for primitives |
| Font | Geist via `next/font` | Single family, tabular nums |
| Icons | Hugeicons free (`@hugeicons/react` + `@hugeicons/core-free-icons`), Morphicons for toggles | Uncommon, rounded stroke suits warm-white |
| Motion | `motion/react` (Framer Motion) for layout/FLIP + springs; CSS for micro | Leaderboard reorder, sheet, odometer |
| State | Zustand (game + settings), TanStack Query for server reads | Small, no boilerplate |
| Backend | Supabase: Postgres, Realtime, Auth (anonymous → Google/magic link), Edge Functions | One vendor, RLS, free tier 50k MAU |
| Guess validation | Supabase Edge Function `submit-guess` (Deno) | Answer never leaves the server |
| Word data | `wordlists.json` → seeded into `word_bank` table; guess lists shipped to client as gzipped JSON per length | Client validates spelling offline, server validates answer |
| Hosting | Vercel (app), Supabase cloud (data) | `wordroom.nischalgupta.dev` CNAME → Vercel |
| Testing | Vitest (scoring, hard-mode rules), Playwright (join flow, mobile viewport 375×667) | |
| Tooling | pnpm, Biome (lint+format), Husky pre-commit, GitHub Actions CI | |

## Data model

```sql
rooms        (id, code unique, name, host_player_id, max_players int default 8, created_at, archived_at)
players      (id, room_id, auth_user_id nullable, name, settings jsonb, created_at)  -- unique (room_id, lower(name))
puzzles      (id, room_id, mode int, number int, answer text)                          -- RLS: no client select
attempts     (id, player_id, puzzle_id, guesses text[], solved bool, guess_count int, elapsed_ms int,
              timer_mode text, hard_mode bool, finished_at)                            -- unique (player_id, puzzle_id)
word_bank    (word text, len int, rank int)                                            -- answers only
leaderboard_week / leaderboard_all  = views over attempts, points = greatest(0, 7 - guess_count)
```

Answer for (room, mode, N) = `word_bank[ hash(room.seed || mode || N) mod count ]`, materialised into `puzzles` on first request.

## Parallel workstreams (one agent each)

Run from one repo with git worktrees; each agent owns a folder and a branch. Shared contract first (workstream 0), then the rest in parallel.

**0. Contract (do first, 1 agent, ~1 hr)**
- `packages/shared`: types for Room, Player, Attempt, Score; `scoreGuess()`, `isHardModeValid()`, `points()` with Vitest.
- Supabase migration files from the data model above, RLS policies, seed script for `word_bank`.
- `CLAUDE.md` with tokens, folder ownership, and "never expose answers" rule.

**1. Design system + shell** (`apps/web/app`, `components/ui`)
- Tailwind `@theme` tokens from prototype. Geist. Hugeicons wrapper `<Icon>` at 18–20/1.6.
- Layout shell: mobile-first 100dvh grid, sheet primitive (Vaul), toast, segmented control, switch, code boxes.
- Storybook-lite page `/dev/ds` showing every token and component state.

**2. Game engine + board** (`features/game`)
- Zustand store: current puzzle, guesses, key states, timer.
- Board, keyboard (physical + on-screen), all animations from the motion spec, reduced-motion.
- Result sheet, share grid text, next-puzzle transition, odometer.
- Calls `submit-guess`; client-side spelling check against guess list.

**3. Rooms + identity** (`features/rooms`, `app/(onboarding)`)
- Home, Create, Join (code boxes, lookup), Name (availability, lock confirm), Lobby, Room sheet.
- Anonymous auth on first load; `players` row on lock; save-progress nudge after first result; `linkIdentity` flow.

**4. Leaderboard + settings** (`features/leaderboard`, `features/settings`)
- Realtime subscription on `attempts` for the room; week/all-time; FLIP reorder; hard-mode badge; rank delta for result sheet.
- Settings sheet: timer modes, preset chips + custom stepper, hard mode, persisted to `players.settings`.

**5. Backend functions** (`supabase/functions`)
- `create-room`, `join-room` (code lookup, capacity 8, name uniqueness), `get-puzzle` (materialise answer server-side), `submit-guess` (validate, score, hard-mode check, write attempt, return colours only), `reveal`.
- Rate limits, input validation (zod), tests with `supabase test`.

**6. Quality + ship** (last, 1 agent)
- Playwright: create→join→name→solve on 375×667 and 1280×800; answer never in network log.
- Lighthouse ≥ 95 perf/a11y on mobile. PWA manifest, icons, OG image for share links.
- CI: typecheck, lint, unit, e2e on PR. Vercel preview per branch. Domain + DNS.

## Checklist (definition of done)

**Foundations**
- [ ] Repo scaffolded, pnpm workspaces, Biome, Husky, CI green on empty app
- [ ] Supabase project, migrations applied, RLS on every table, `word_bank` seeded (5/6/7)
- [ ] Tokens in Tailwind match prototype hex-for-hex; Geist loading with no FOUT
- [ ] `/dev/ds` renders every component state

**Flows**
- [ ] Create room → code shown in lobby → friend joins with code in < 60 s
- [ ] Name uniqueness enforced server-side; no rename path anywhere in UI or API
- [ ] Puzzle No. N is identical for all players in a room per mode
- [ ] Next puzzle available immediately after solve/fail; no waiting on others
- [ ] Physical keyboard works on desktop; no hidden input on mobile
- [ ] Result sheet: title tiers, guesses, time (if timer), rank delta, share grid, Next
- [ ] Save-progress nudge shows once, after first result, never before
- [ ] Sign-in upgrades anonymous user without losing room or name

**Rules + scoring**
- [ ] Invalid word → shake + toast; not counted as a guess
- [ ] Hard mode rejects guesses that drop a green or omit a yellow, with a specific message
- [ ] Points = 7 − guesses, fail = 0; avg guesses shown; time only breaks ties
- [ ] Weekly board resets Monday 00:00 host timezone; all-time persists
- [ ] Timer: off by default; per-puzzle presets + custom 0:30–10:00; timeout = fail; changes apply next puzzle

**Modes**
- [ ] 5 default; 6 and 7 each have own sequence and leaderboard
- [ ] Mode switch animates and keeps the current puzzle in the previous mode intact

**Security**
- [ ] Answer absent from every client response until solved/failed/revealed (Playwright asserts)
- [ ] Guess validation server-side; client list only for spelling
- [ ] Room capacity 8 enforced server-side; codes exclude 0/O/1/I

**Quality**
- [ ] Game screen has no vertical scroll at 375×667 and 360×640
- [ ] All animations ≤ 600 ms; reduced-motion fallbacks verified
- [ ] Lighthouse mobile ≥ 95 performance and accessibility
- [ ] Visible focus states; sheets trap focus; Escape closes
- [ ] PWA installable; offline shows a clear "reconnect to play" state
- [ ] Deployed at wordroom.nischalgupta.dev with OG share image

## Stats + share (added)

**Stats** — per player, per mode, per room (a tab "Your stats" inside the Leaderboard sheet; also linked from the result sheet).
- Played, Win %, Current streak, Max streak. Streak = consecutive puzzle numbers solved in that mode; skipping a number or failing breaks it.
- Guess distribution: six horizontal bars, count at bar end, today's row in `--correct`, others in `--surface-2`. Bars animate width on open.
- Source: `attempts` grouped by player + mode; computed in a view, cached client-side.

**Share** — two formats, both from the result sheet. Text via Web Share API (falls back to clipboard); image via `/api/share/[attemptId].png` (Vercel OG, warm-white card) for Instagram/WhatsApp.

Spoiler-free (default):
```
Wordroom No. 12 · 4/6
⬜⬜⬜🟨⬜
🟩🟨⬜⬜⬜
🟩🟩⬜🟩🟩
🟩🟩🟩🟩🟩
wordroom.nischalgupta.dev/r/KHX7
```
With letters (shows guesses and the answer):
```
Wordroom No. 12 · 4/6
C R A N E  ⬜⬜⬜🟨⬜
S O U N D  🟩🟨⬜⬜⬜
S T I N G  🟩🟩⬜🟩🟩
S W I N G  🟩🟩🟩🟩🟩
```
- Letters version gates behind a one-line confirm: "This reveals the answer to anyone in your room who hasn't played No. 12." Never the default.
- Hard mode adds `*` after 4/6, timer adds `in 1:38`.
- Share link opens the room's join screen with the code prefilled.

**Checklist additions**
- [ ] Stats tab shows played / win % / streaks / distribution per mode; today's bar highlighted
- [ ] Streak logic covered by unit tests (skip, fail, mode isolation)
- [ ] Spoiler-free share matches the exact text format above; Web Share on mobile, clipboard on desktop
- [ ] Letters share requires confirm; image endpoint renders both variants in < 1 s
- [ ] Share link prefills the room code on the join screen

## Not in v1
Race mode, friends list across rooms, set-a-word, difficulty tiers, dark mode, native apps.
