/**
 * Request schemas. Every function validates its body before it touches the
 * database, so a malformed request is a 400 with a readable message rather than
 * a Postgres constraint error.
 *
 * The bounds here mirror the check constraints in the init migration on
 * purpose. The database is still the authority — this layer exists to give a
 * better message, not to replace it.
 */

import { type Mode, MODES } from '@wordroom/shared'
import { z } from 'zod'
import { CODE_PATTERN } from './codes.ts'

/** Rejects control characters, which would render as invisible names. */
const DISPLAY_TEXT = /^[^\p{Cc}\p{Cf}]+$/u

export const modeSchema = z
  .union([z.literal(5), z.literal(6), z.literal(7)])
  .refine((value): value is Mode => MODES.includes(value))

export const puzzleNumberSchema = z
  .number()
  .int('Puzzle number must be a whole number.')
  .min(1, 'Puzzle numbers start at 1.')
  .max(100_000, 'That puzzle number is out of range.')

export const playerNameSchema = z
  .string()
  .trim()
  .min(1, 'Pick a display name.')
  .max(20, 'Names are up to 20 characters.')
  .regex(DISPLAY_TEXT, 'That name contains characters we cannot show.')

export const roomNameSchema = z
  .string()
  .trim()
  .min(1, 'Give the room a name.')
  .max(40, 'Room names are up to 40 characters.')
  .regex(DISPLAY_TEXT, 'That name contains characters we cannot show.')

export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(CODE_PATTERN, 'Room codes are 4 characters, A-Z and 2-9.')

/** An IANA zone the runtime actually knows; anything else would break the week boundary. */
export const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine((zone) => {
    try {
      new Intl.DateTimeFormat('en-GB', { timeZone: zone })
      return true
    } catch {
      return false
    }
  }, 'Unknown timezone.')

/** Client-reported play time. Only ever breaks ties, never adds points. */
export const elapsedMsSchema = z
  .number()
  .int()
  .min(0)
  .max(24 * 60 * 60 * 1000)

export const createRoomSchema = z.object({
  roomName: roomNameSchema,
  playerName: playerNameSchema,
  timezone: timezoneSchema.optional(),
})
export type CreateRoomRequest = z.infer<typeof createRoomSchema>

export const joinRoomSchema = z.object({
  code: roomCodeSchema,
  playerName: playerNameSchema,
})
export type JoinRoomRequest = z.infer<typeof joinRoomSchema>

export const getPuzzleSchema = z.object({
  roomId: z.uuid('Expected a room id.'),
  mode: modeSchema,
  number: puzzleNumberSchema,
})
export type GetPuzzleRequest = z.infer<typeof getPuzzleSchema>

/**
 * Either a guess, or a timeout. A timeout carries no word: the timer expired,
 * the attempt is a fail, and the answer is unlocked.
 */
export const submitGuessSchema = z.union([
  z.object({
    puzzleId: z.uuid('Expected a puzzle id.'),
    guess: z.string().trim().min(1).max(16),
    elapsedMs: elapsedMsSchema.optional(),
    timedOut: z.literal(false).optional(),
  }),
  z.object({
    puzzleId: z.uuid('Expected a puzzle id.'),
    guess: z.undefined().optional(),
    elapsedMs: elapsedMsSchema.optional(),
    timedOut: z.literal(true),
  }),
])
export type SubmitGuessRequest = z.infer<typeof submitGuessSchema>

/** Reveal takes whichever id the caller has to hand; both resolve to their own attempt. */
export const revealSchema = z.union([
  z.object({ attemptId: z.uuid('Expected an attempt id.') }),
  z.object({ puzzleId: z.uuid('Expected a puzzle id.') }),
])
export type RevealRequest = z.infer<typeof revealSchema>
