# Wait mode

Date: 2026-10-12. Status: implemented (see Implementation notes).

## Why

Play-tester feedback: "Can add a setting, specific to a room. Go speedrun where
u don't wait, just rank up. And another where you wait." Today every player
advances independently (spec v1: "No one waits"). Wait mode lets a room play
together, in rounds.

## Behaviour

- **Setting.** Room sheet, host only: **Pace — Speedrun / Wait**. Default
  Speedrun (today's behaviour). A change applies from the next round.
- **Round.** Puzzle N of one mode. Each mode (5, 6, 7, Four) has its own rounds.
  In Wait mode the server refuses puzzle N+1 until round N has ended.
  Puzzles at or below the open round stay playable, so a player who is behind
  can always catch up.
- **Who a round waits for.** Players who open puzzle N during the round. Opening
  it registers them as participants, server-side. Live presence is shown in the
  UI but never trusted for the rule. A player who arrives mid-round joins that
  round; one who arrives after it ends starts at N+1.
- **A round ends when** any of:
  1. every participant has finished (solved or failed);
  2. the host skips the players still playing;
  3. the only unfinished participants have not guessed for 10 minutes and every
     other participant is done.
  Condition 3 is evaluated whenever anyone asks for the next puzzle, so no
  scheduled job is needed.
- **Waiting screen.** The result sheet shows "Waiting for Priya, Sam…" with
  their colour grids filling in live. When the round ends, every waiting
  player's **Next puzzle** becomes available at once (realtime).
- **Scoring and leaderboard.** Unchanged and shared with Speedrun. Pace changes
  timing only, so switching never splits a room's history.

## Data

- `rooms.pace text not null default 'speedrun' check (pace in ('speedrun','wait'))`.
  Host-only update, through an RPC (`set_room_pace`) rather than a column grant.
- `room_rounds (room_id, mode, number, started_at, ended_at, primary key
  (room_id, mode, number))`.
- `round_participants (room_id, mode, number, player_id, joined_at, primary
  key (room_id, mode, number, player_id))`.
- `get_puzzle` / `get_four`: in Wait mode, open the round for N if none is
  open, register the caller, and refuse any N beyond the open round
  (`round_not_over`, with who is still playing). Ending a round and opening the
  next happen here, inside the request that asks for N+1.
- `skip_round(room, mode)` (host only): ends the open round.
- `room_rounds` and `round_participants` are readable by room members and in
  the realtime publication; no client writes.
- Switching to Speedrun ends any open round.

## Edge cases

- A participant leaves the room: they stop counting toward the round.
- The host leaves: hosting already passes on per the existing leave flow; the
  new host can skip.
- A room switches pace mid-round: Wait→Speedrun ends the round immediately;
  Speedrun→Wait opens a round at each player's next puzzle request, at the
  highest number anyone in the room has reached for that mode.

## Testing

- `supabase/tests/wait_mode.test.sql`: the N+1 gate, registration on open, each
  end condition, host-only skip and pace change, late arrival, pace switch.
- Playwright, two browsers: A finishes and sees "Waiting for B"; B finishes;
  both get Next puzzle together.
- Spec v1's "No one waits" rule is reworded to "No one waits in Speedrun".

## Rollout

Depends on nothing in the Four spec, but if both ship, `get_four` needs the
same gate. A migration; apply before merge.

## Implementation notes

Where the build differs from the design above, and why:

- **Polling, not realtime.** The waiting screen asks `wait_status` every 4s
  while a player is looking at a finished puzzle (or the room sheet).
  `wait_status` also ends a round that is over, so waiting players move on
  without anyone tapping. Neither round table is readable by clients or in the
  realtime publication.
- **Names, not live grids.** The waiting note names who the round is waiting
  for; their colour grids are on the leaderboard, as before.
- **Late arrival.** A request for a number at or below the last ended round is
  always allowed (catching up). The first request past it opens the next round.
- **Arriving while held.** A player who reloads, or opens the room, while the
  round they would join next has not started yet sees the waiting note in place
  of the keyboard, and their puzzle opens when the round ends.
