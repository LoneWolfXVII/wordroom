# More games: 6 and 7 letters, and Four at once

Date: 2026-10-12. Status: design approved in conversation; awaiting spec review.

## Why

Play-testers want more variety, but "Wordroom" should stay a room of friends
guessing the same words. Market scan (Oct 2026): multi-board games (Quordle,
Octordle) are the most durable spinoff format; Connections/Strands-style games
need hand-written puzzles, which does not fit unlimited puzzles per room.
Nothing found combines a private friend room, unlimited shared puzzles and a
persistent leaderboard, which is Wordroom's angle.

## Part 1 — Release 6 and 7 letters

Already built end to end: 1,600 answers each (`word_bank`), puzzle sequences,
per-mode boards, the switcher. Hidden at `features/game-route/index.tsx`
(`showModes={false}`).

- Turn the switcher on.
- Verify a 7-letter row and keyboard fit 375×667 with no vertical scroll.
- Verify the leaderboard and stats follow the selected mode.
- Spec v1 moves "6- and 7-letter modes" from P1 to shipped.

## Part 2 — Four at once

### Rules

- Four hidden 5-letter words, 9 guesses. Each guess is typed once and scored
  on every unsolved board. A solved board locks.
- The game ends when all four are solved or the 9th guess is used.
- A guess must be a real 5-letter word; an invalid word shakes and is not
  consumed (as today).
- Hard mode and timers are not offered in Four. Elapsed time is still
  recorded, for tie-breaks only.
- Same puzzle sequence for everyone in the room, unlimited, like other modes.

### Scoring

- Per board: `10 − n` where `n` is the guess that solved it; 0 if unsolved.
  Best possible game: 9 + 8 + 7 + 6 = 30.
- A game counts as *solved* (for stats and streaks) only if all four boards
  are solved. Streaks are per mode, as today.
- Ranking order is unchanged: points, then average guesses, then total time.
  For Four, "guesses" of a game is the number of guesses used.

### Screen (must fit 375×667, no vertical scroll)

- Switcher reads **5 · 6 · 7 · Four**.
- 2×2 grid of boards, each 5 wide × 9 tall, tiles ≈22px.
- Each key is split into four quadrants showing that letter's state on each
  board.
- The current row is drawn on every unsolved board. A solved board dims and
  shows its word.
- Result sheet: the four boards and the points.
- Share text, spoiler-free, one digit per board (🟥 = unsolved):

  ```
  Wordroom Four No. 12 · 26 pts
  4️⃣6️⃣
  8️⃣🟥
  ```

- Leaderboard: its own board with week/all-time tabs. A row's "this puzzle"
  cell shows four chips with the solved-at numbers instead of a colour grid.

### Data

- **Mode.** Four is mode `4` in the existing integer `mode` columns. A new
  `wordLength(mode)` in `@wordroom/shared` returns 5 for mode 4 and the mode
  otherwise. Every place that treats mode as word length uses it. `Mode` type
  gains `4`.
- **Puzzles.** New `board smallint not null default 1`, `check (board between
  1 and 4)`, and `check (mode = 4 or board = 1)`. Uniqueness becomes
  `(room_id, mode, number, board)`. The answer shape check becomes
  `char_length(answer) = case mode when 4 then 5 else mode end`. Column grants
  are unchanged: each board's answer is as secret as any other.
- **Sequence.** Four game N, board b uses position `4(N−1)+b` of a 5-letter
  shuffle keyed by the room seed plus `':four'`, with the same wrap behaviour
  as `puzzle_index`. Four distinct words per game, independent of the room's
  5-letter sequence. The TypeScript and SQL derivations must agree;
  `verify-sql-parity.mts` covers Four.
- **Attempts.** One row per board. `attempts_guess_count_valid` widens to
  0–9; the guess functions enforce 6 for modes 5–7 and 9 for Four. A board
  only receives guesses while unsolved, so its `guess_count` is its solved-at
  number.
- **`get_four(room, number)`** (RPC, security definer, membership check like
  `get_puzzle`): materialises and returns the four board puzzle ids and the
  caller's attempts on them. Never an answer of an unfinished board.
- **`submit_four_guess(room, number, guess, elapsed_ms)`** (RPC): validates the
  word once against `guess_bank` (len 5), then scores it against every
  unsolved board in one transaction. Returns marks per board. Returns a
  board's answer when that board is solved, and every board's answer once the
  game ends (same reveal rule as a failed puzzle). Rejects a guess after the
  game is over.
- **`four_games` view** (security definer, membership-filtered like the
  leaderboard views): one row per player per Four game — points, boards
  solved, guesses used, elapsed. The leaderboard views read Four from it so
  `played` and `solved` count games, not boards.
- **Points.** `points.ts` gains the Four rule; `attempt_points` SQL twin
  changes with it, as CLAUDE.md requires.
- **Realtime.** No change: board attempts publish like any attempt. The member
  list status for Four is derived per game.

### Not in this version

Octordle-size boards (8+), hard mode in Four, timers in Four.

## Testing

- Vitest: Four points, solved-game rule, share text, `wordLength`.
- `verify-sql-parity.mts`: Four sequence matches TypeScript, including wrap.
- `supabase/tests/four.test.sql`: solving boards, the 9-guess end, answer
  reveal timing, invalid word not consumed, guess after end rejected,
  non-member refused, answers of unfinished boards never returned.
- Playwright: play a Four game to the end on mobile; the leaderboard shows it.
- CI's answer grep stays green.

## Rollout

A migration (not applied to production by the branch). Order: apply the
migration, then merge, as with the seat handoff.
