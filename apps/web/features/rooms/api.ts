import { FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js'
import { getBrowserClient } from '@/lib/supabase'
import { SupabaseConfigError } from '@/lib/supabase/env'
import { normaliseCode } from './code'
import { ApiError, parseErrorEnvelope } from './errors'
import { type Seat, seatSchema } from './schemas'

/**
 * The two Edge Functions this workstream calls.
 *
 * Both of them decide, server-side and without a race, things this client
 * deliberately does not try to know: whether a code exists, whether a room has
 * room, and whether a name is free. Everything here does is ask well and hand
 * the answer to `resolveRoomsError`.
 */

/** Everything leaves here as an `ApiError`, so callers switch on one type. */
async function invoke<T>(
  name: string,
  body: Record<string, unknown>,
  parse: (value: unknown) => T,
): Promise<T> {
  let client: SupabaseClient
  try {
    client = getBrowserClient()
  } catch (error) {
    if (error instanceof SupabaseConfigError) {
      throw new ApiError('not_configured', error.message)
    }
    throw error
  }

  const { data, error } = await client.functions.invoke(name, { body })

  if (error) {
    // A non-2xx keeps the whole Response on `context`, which is where the
    // `{ error: { code } }` envelope actually is; `error.message` is only ever
    // "Edge Function returned a non-2xx status code".
    if (error instanceof FunctionsHttpError) {
      const envelope = await error.context
        .json()
        .then(parseErrorEnvelope)
        .catch(() => null)
      if (envelope) throw envelope
      throw new ApiError('internal', error.message)
    }
    // The request never reached a function: offline, DNS, CORS.
    throw new ApiError('network', error.message)
  }

  return parse(data)
}

/**
 * The host's timezone, which decides when this room's weekly board rolls over.
 *
 * Sent from the browser because that is the only place that knows it. The server
 * validates it and falls back to UTC, so a browser that reports something odd
 * costs a default, not an error.
 */
function browserTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
  } catch {
    return undefined
  }
}

export interface CreateRoomInput {
  roomName: string
  playerName: string
}

/** `POST create-room` — makes the room, seats the caller as its host. */
export async function createRoom({ roomName, playerName }: CreateRoomInput): Promise<Seat> {
  const timezone = browserTimezone()
  return invoke(
    'create-room',
    { roomName, playerName, ...(timezone ? { timezone } : {}) },
    (value) => seatSchema.parse(value),
  )
}

export interface JoinRoomInput {
  code: string
  playerName: string
}

/**
 * `POST join-room` — the code lookup, the capacity check and the name check, all
 * as one atomic decision.
 *
 * There is no separate "does this room exist" call to make first: a non-member
 * has no select privilege on `rooms`, and pre-checking capacity or a name would
 * be a race the database has already won. Re-joining with the same name returns
 * the existing seat, so a double tap is harmless.
 */
export async function joinRoom({ code, playerName }: JoinRoomInput): Promise<Seat> {
  return invoke('join-room', { code: normaliseCode(code), playerName }, (value) =>
    seatSchema.parse(value),
  )
}
