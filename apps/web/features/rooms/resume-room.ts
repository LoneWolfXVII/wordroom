import type { ActiveRoom } from './storage'

/**
 * Which room, if any, the home screen offers to reopen — and under what name.
 *
 * Split out of the screen because the decision is the whole feature: the resume
 * card used to wait for two sequential queries and then shove the rest of the
 * stack down when it landed. This picks the best answer available *now*, so the
 * card can be painted from `localStorage` and corrected in place later.
 */

/** A room the card can actually render: it has a name to show. */
export interface ResumeRoom {
  id: string
  name: string
}

export interface ResumeRoomInput {
  /**
   * The settled seat, once both queries have landed. Structural on purpose, so
   * this module stays free of React Query and testable on its own.
   */
  seat: { room: { id: string; name: string } } | null
  /** What storage remembers. Available at first paint, and possibly stale. */
  hint: ActiveRoom | null
  /** True until `useActiveSeat` has a settled answer about the seat. */
  isLoading: boolean
}

export function resolveResumeRoom({ seat, hint, isLoading }: ResumeRoomInput): ResumeRoom | null {
  // The seat is the fact and always wins, so a cached name that has drifted is
  // corrected in place rather than persisting.
  if (seat) return { id: seat.room.id, name: seat.room.name }

  // Settled, and there is no seat. The cache was wrong; showing a card that
  // leads nowhere is worse than the card disappearing.
  if (!isLoading) return null

  // Still loading. The cache is the best guess there is, and tapping it is safe
  // whether or not it is stale: /lobby resolves the real seat for itself.
  return hint !== null && hint.name !== null ? { id: hint.id, name: hint.name } : null
}

/**
 * The letter on the room's tile — the room's initial, as `Avatar` does for a
 * player. Code points rather than `charAt`, so an emoji first character comes
 * back whole instead of as half a surrogate pair.
 */
export function roomMark(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? ''
}
