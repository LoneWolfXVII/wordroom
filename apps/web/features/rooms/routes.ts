/**
 * Paths this feature links to.
 *
 * `GAME_PATH` belongs to workstream 2, not here. It is named once so that when
 * that route settles on something other than `/game`, the lobby's "Start
 * playing", the lobby's close button and the room sheet all follow from a
 * one-line change.
 */
export const GAME_PATH = '/game'

/** The share link the lobby hands out. `/r/<CODE>` opens the join screen filled in. */
export function joinPathForCode(code: string): string {
  return `/join?code=${encodeURIComponent(code)}`
}
