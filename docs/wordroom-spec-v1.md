# Wordroom — v1 Spec

Name decided: Wordroom. Never use "Wordle" in product or marketing copy — NYT trademark.

## Problem

NYT Wordle allows one puzzle per day and no way to play with a specific group of friends. People who want to play more, race friends, or keep a running score have no clean option. Existing clones are ugly, ad-heavy, or single-player.

## Goals

1. A player can create a room, share a code, and have a friend playing the same puzzle sequence within 60 seconds.
2. Unlimited puzzles per room; no player is blocked waiting for another.
3. A leaderboard that feels fair and is worth competing on across a week.
4. Design quality on par with NYT Games — warm, professional, mobile-first.

## Non-goals (v1)

- Native iOS/Android apps — PWA is enough.
- Public matchmaking or global leaderboard — rooms are private groups only.
- Dark mode — light mode only per design brief.
- Custom word entry by players — later.
- Monetisation, ads, accounts with email/password — later.

## Users

- **Host**: creates a room, shares the code, manages settings.
- **Player**: joins via code, picks a locked display name, plays.

## User stories

- As a host, I want to create a room and get a short code so I can share it in a chat.
- As a player, I want to join with a code and pick a name so I can start immediately.
- As a player, I want to start the next puzzle as soon as I finish so I never wait on others.
- As a player, I want to see the puzzle number so my friends and I can compare the same one.
- As a player, I want to see the room leaderboard for the mode I'm playing so I know where I stand.
- As a player, I want an optional timer so I can play fast rounds when I choose.
- As a player, I want a clear result moment when I solve so finishing feels good.
- As a player on a phone, I want the whole game on one screen so I don't scroll during play.

## Requirements

### P0 — must ship

**Rooms**
- Create room → 4-letter code (A–Z minus O and I).
- Join by code. Max 8 players, enforced server-side.
- Room holds one seeded puzzle sequence per mode. Puzzle N is the same word for every player in that room.
- Room persists indefinitely; host can archive.

**Identity**
- Display name chosen on join; unique within room; locked after confirm. Shown in a confirmation step ("This can't be changed later").
- Anonymous auth (Supabase) on first load. Sign-in prompted once, after the first puzzle's result — never before. Upgrading keeps room and name.

**Puzzle flow**
- 5-letter mode, 6 guesses.
- Header shows `No. <n>` — the room's puzzle counter, starting at 1.
- "Next puzzle" available immediately after solve/fail. Each player advances independently; the leaderboard compares per puzzle number.
- Physical keyboard input on desktop; on-screen keyboard on all devices. No hidden `<input>`.
- Answer is never sent to the client until the puzzle is solved, failed, or revealed. Guesses are validated server-side.
- Guess list (valid words) is broad; answer list is curated: no plurals, proper nouns, or obscure words. Difficulty tiers reserved for P1.

**Result moment**
- On solve: tiles bounce, result sheet shows guesses used, time (if timer on), rank change, and "Next puzzle".
- Share, two formats: spoiler-free colour grid (default; ⬜🟨🟩 rows, `Wordroom No. 12 · 4/6`, room link) and with-letters (guess words beside each row; behind a confirm because it spoils the room). Web Share on mobile, clipboard on desktop, PNG card for stories.

**Stats** (per player, per mode)
- Played, win %, current streak, max streak, six-bar guess distribution with today's bar highlighted. Streak = consecutive puzzle numbers solved; a skip or fail resets it.
- On fail: reveal the word, same sheet minus celebration.

**Leaderboard**
- One board per mode (5 / 6 / 7). Switching mode switches the board.
- Row: rank, locked name, hard-mode badge, this-puzzle colour grid (no letters), score, average guesses.
- Score = per-puzzle points by guesses used (6→1, 5→2 … 1→6, fail→0). Timer adds a bonus only when timer is on (P0 rule: define once, documented on the Rules page).
- Views: this week, all time. Weekly resets Monday 00:00 room-local (host's timezone).
- Updates live via realtime subscription.

**Timer**
- Off by default. When on, one of: per puzzle (presets 1/2/3/5 min + custom 0:30–10:00, 30 s steps; default 3:00), per guess (0:20), sprint (fastest 5 solves). Timeout counts as a fail. Changes apply from the next puzzle.
- Timer state is per player, not per room.

**Mobile-first layout**
- Game screen fits one viewport at 375×667. No vertical scroll during play.
- Leaderboard and settings open in a bottom sheet from the header. On ≥ 820px the sheet content renders as a fixed right panel.

**Design system**
- Light mode only. Background `#F5F1EA`, surface `#FBF9F5`, ink `#1F1C18`, muted `#7A7268`, line `#E3DCD0`, accent `#2F5D62`.
- Tile colours: correct `#5B8C5A`, present `#C9A227`, absent `#A9A196`, unused key `#EAE4DA`. Text on coloured tiles `#F5F1EA`.
- Rules page uses the same three swatches with the same names.
- Typeface: Geist (single family). Tabular numerals for numbers and codes.
- Icons: Hugeicons free (Stroke Rounded), size 18–20, stroke 1.6. Morphicons for state toggles. Lucide rejected as too common.
- Motion: Motion (motion/react) + CSS. 120 ms micro, 200 ms state, 350 ms structural, 600 ms reveal with 70 ms stagger. Motion answers an action; only the row reveal and result moment animate unprompted. Reduced-motion fallbacks required.
- No cartoon illustration, no confetti, no gradients.

### P1 — fast follow

- 6- and 7-letter modes with their own sequences and boards.
- Hard mode toggle (greens must stay, yellows must be reused). Shown as a badge on leaderboard rows.
- Difficulty tiers per room: common / tricky / brutal.
- Live grid: see friends' colour-only progress on the current puzzle.
- Friends list across rooms; invite friend directly to a room.
- Race mode: same word, synchronized start, first solve wins.
- Streak tracking per player.
- Host controls: kick player, set max players, reset week.

### P2 — design for, don't build

- "Set a word" — one player sets, others solve.
- Elo rating for race mode.
- Themed word packs.
- Offline play with sync (PWA cache of guess list only — never answers).

## Tech (proposed)

- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui.
- Supabase: Postgres, Realtime, Auth (anonymous → Google/magic link), Edge Functions for guess validation.
- Vercel hosting at wordroom.nischalgupta.dev. Full stack table in wordroom-build-plan.md.

**Data model (core)**
- `rooms` (id, code, host_id, max_players, settings, created_at)
- `players` (id, room_id, name, created_at) — unique (room_id, name)
- `puzzles` (room_id, mode, number, word_hash, salt) — word derived from room seed + number, never stored plain in a client-readable table
- `attempts` (player_id, puzzle_id, guesses[], solved, guess_count, elapsed_ms, timer_mode, hard_mode, finished_at)
- Leaderboard = materialised view over `attempts`, grouped by mode and week.

## Acceptance criteria (P0 sample)

- Given a host creates a room, when they share the code, then a friend joins and lands on puzzle No. 1 within one screen.
- Given a player confirms a name, when they reopen the app, then the name is fixed and no edit control exists.
- Given a player solves puzzle No. 7, when they tap "Next puzzle", then No. 8 loads without any other player having finished No. 7.
- Given a player inspects network traffic mid-puzzle, then the answer is not present in any response.
- Given a 375×667 viewport, when a puzzle is in progress, then header, grid, and keyboard are fully visible with no scrolling.
- Given timer is off, then no time is shown and no time bonus is applied.
- Given two players are on the same puzzle, when one solves, then the other's leaderboard updates within 2 seconds.

## Success metrics

- Leading: rooms created → ≥ 2 players joined (target 60%). Puzzles per player per day (target ≥ 3). Solve rate 5-letter (target 85–92% — below 80% means the list is too hard).
- Lagging: day-7 retention of players in a room with ≥ 3 members (target 40%). Rooms active at week 4 (target 30%).

## Open questions

- **Name lock scope** — per room only, or global identity across rooms? Affects P1 friends list. (You)
- **Word list pass** — pipeline still leaks some irregular participles and -ier comparatives (taken, known, easier); add rules before seeding. (Eng)

## Phasing

1. **Week 1–2**: rooms, names, 5-letter puzzle loop, server validation, result sheet, mobile layout.
2. **Week 3**: leaderboard (weekly/all-time, realtime), timer modes, Rules page.
3. **Week 4**: polish, PWA, share grid, soft launch to 2–3 friend groups.
4. **After**: P1 in order of demand — 6/7-letter, hard mode, live grid.
