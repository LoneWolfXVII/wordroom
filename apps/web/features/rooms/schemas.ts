import { DEFAULT_PLAYER_SETTINGS, type Player, type Room } from '@wordroom/shared'
import { z } from 'zod'

/**
 * Runtime shapes for everything that crosses the wire.
 *
 * The Edge Functions build their bodies field by field in `_shared/presenters.ts`
 * and hand back the camelCase `@wordroom/shared` types directly, so these
 * schemas mirror those types rather than the database's snake_case rows. Parsing
 * rather than casting means a contract drift shows up here, with a field name,
 * instead of as `undefined` three components later.
 */

export const playerSettingsSchema = z
  .object({
    timerMode: z.enum(['off', 'per-puzzle', 'per-guess', 'sprint']).catch('off'),
    perPuzzleSeconds: z.number().int().catch(DEFAULT_PLAYER_SETTINGS.perPuzzleSeconds),
    hardMode: z.boolean().catch(false),
  })
  // `settings` is jsonb, so it can be any shape the day someone writes to it by
  // hand. Every field falls back rather than failing the whole response: a bad
  // timer preference must not be able to keep a player out of their room.
  .catch(DEFAULT_PLAYER_SETTINGS)

export const roomSchema: z.ZodType<Room> = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  hostPlayerId: z.string().nullable(),
  maxPlayers: z.number().int(),
  timezone: z.string(),
  createdAt: z.string(),
  archivedAt: z.string().nullable(),
})

export const playerSchema: z.ZodType<Player> = z.object({
  id: z.string(),
  roomId: z.string(),
  authUserId: z.string().nullable(),
  name: z.string(),
  settings: playerSettingsSchema,
  createdAt: z.string(),
})

/** `create-room` 201 and `join-room` 200 share this body. */
export const seatSchema = z.object({
  room: roomSchema,
  player: playerSchema,
})

/** A room and the seat the caller holds in it. */
export type Seat = z.infer<typeof seatSchema>
