/**
 * Name validation for the two names a player types: the room's and their own.
 *
 * These are format checks only, and they run to keep the button honest — they
 * are not the authority on anything. Uniqueness and capacity belong to the
 * database, which decides them without a race; this file cannot and does not try
 * to guess those answers.
 */

/** `players_name_length`: 1..20 after trimming. The floor here is the prototype's. */
export const PLAYER_NAME_MIN = 2
export const PLAYER_NAME_MAX = 20

/** `create-room` accepts a room name of 1..40. */
export const ROOM_NAME_MIN = 2
export const ROOM_NAME_MAX = 40

/**
 * What gets sent to the server.
 *
 * Trims the ends and collapses runs of whitespace, so "Friday   crew" and
 * "Friday crew " are the same name and cannot both be taken in one room. The
 * database's uniqueness index is `lower(name)`, so case is already handled
 * there; this only removes the differences that are invisible on screen.
 */
export function normaliseName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim()
}

export type NameProblem = 'empty' | 'too-short' | 'too-long'

export interface NameCheck {
  /** The value to send. Empty when `problem` is set. */
  value: string
  /** Null when the name is well formed. Never says whether it is *available*. */
  problem: NameProblem | null
}

function check(raw: string, min: number, max: number): NameCheck {
  const value = normaliseName(raw)
  if (value.length === 0) return { value, problem: 'empty' }
  // Count code points, not UTF-16 units, so an emoji is one character to the
  // same degree Postgres's char_length considers it one.
  const length = [...value].length
  if (length < min) return { value, problem: 'too-short' }
  if (length > max) return { value, problem: 'too-long' }
  return { value, problem: null }
}

export function checkPlayerName(raw: string): NameCheck {
  return check(raw, PLAYER_NAME_MIN, PLAYER_NAME_MAX)
}

export function checkRoomName(raw: string): NameCheck {
  return check(raw, ROOM_NAME_MIN, ROOM_NAME_MAX)
}

/** Copy for a format problem. Availability messages come from the server. */
export function playerNameProblemMessage(problem: NameProblem): string {
  switch (problem) {
    case 'empty':
      return 'Pick a name so the room knows who you are.'
    case 'too-short':
      return `Use at least ${PLAYER_NAME_MIN} characters.`
    case 'too-long':
      return `Keep it to ${PLAYER_NAME_MAX} characters.`
  }
}
