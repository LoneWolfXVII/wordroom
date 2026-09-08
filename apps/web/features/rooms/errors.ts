import { MAX_PLAYERS } from '@wordroom/shared'
import { z } from 'zod'

/**
 * The Edge Functions' error envelope, and what each code means on screen.
 *
 * Every failure comes back as `{ error: { code, message, details } }`. The README
 * calls `code` the stable half and `message` the displayable one — but the
 * message is written for an API consumer, not for a person halfway through
 * joining a room. So `code` is the contract this file keys off, the copy below
 * is the product's own, and the server's message is the fallback for a code that
 * did not exist when this was written.
 */

const envelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string().optional(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
})

/** Codes these two screens actually act on. Anything else lands on `unknown`. */
export type RoomsErrorCode =
  | 'room_not_found'
  | 'room_archived'
  | 'room_full'
  | 'name_taken'
  | 'already_joined'
  | 'code_unavailable'
  | 'invalid_timezone'
  | 'bad_request'
  | 'unauthorized'
  | 'not_a_member'
  | 'rate_limited'
  | 'internal'
  | 'network'
  | 'not_configured'
  | 'unknown'

/** A failure from an Edge Function, carrying the code the UI switches on. */
export class ApiError extends Error {
  readonly code: string
  readonly details: Record<string, unknown>

  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.details = details
  }
}

/**
 * Read the envelope out of a response body.
 *
 * Returns null when the body is not one — a proxy timeout serving HTML, say — so
 * the caller can fall back to a generic failure instead of showing a fragment of
 * someone else's error page.
 */
export function parseErrorEnvelope(body: unknown): ApiError | null {
  const parsed = envelopeSchema.safeParse(body)
  if (!parsed.success) return null
  const { code, message, details } = parsed.data.error
  return new ApiError(code, message ?? '', details ?? {})
}

/** Which control the player has to return to. Null when nothing they typed is wrong. */
export type RoomsErrorField = 'code' | 'playerName' | 'roomName' | null

export interface RoomsErrorResolution {
  code: RoomsErrorCode
  /** One short line, in the product's voice. Safe to render directly. */
  message: string
  field: RoomsErrorField
  /**
   * The account already holds a seat in this room under a locked name. Nothing
   * is wrong and nothing can be fixed — names never change — so the flow should
   * carry them into the room rather than ask them to try again.
   */
  alreadySeated: boolean
  /** Worth offering a retry button. False when trying again cannot help. */
  retryable: boolean
}

const KNOWN: Record<
  string,
  { message: string; field: RoomsErrorField; alreadySeated?: boolean; retryable?: boolean }
> = {
  room_not_found: {
    message: 'No room has that code. Check it with whoever made the room.',
    field: 'code',
  },
  room_archived: {
    message: 'That room has been closed.',
    field: 'code',
  },
  room_full: {
    message: `That room is full. ${MAX_PLAYERS} players is the limit.`,
    field: 'code',
  },
  // The prototype's exact wording for this one.
  name_taken: {
    message: 'Someone in this room already has that name.',
    field: 'playerName',
  },
  already_joined: {
    message: "You're already in this room.",
    field: null,
    alreadySeated: true,
  },
  code_unavailable: {
    message: 'Could not get a free code just now. Try again.',
    field: null,
    retryable: true,
  },
  invalid_timezone: {
    message: 'Could not read your timezone. Try again.',
    field: null,
    retryable: true,
  },
  bad_request: {
    message: 'That did not look right. Check it and try again.',
    field: null,
  },
  unauthorized: {
    message: 'Your session expired. Reload the page and try again.',
    field: null,
    retryable: true,
  },
  not_a_member: {
    message: "You're not in that room.",
    field: null,
  },
  rate_limited: {
    message: 'Too many tries. Give it a minute.',
    field: null,
    retryable: true,
  },
  internal: {
    message: 'Something went wrong at our end. Try again.',
    field: null,
    retryable: true,
  },
  network: {
    message: 'Could not reach the server. Check your connection.',
    field: null,
    retryable: true,
  },
  not_configured: {
    message: 'This app is not connected to a server yet.',
    field: null,
  },
}

const FALLBACK = 'Something went wrong. Try again.'

/**
 * Turn anything thrown by the API layer into something a screen can render.
 *
 * Total by construction: an `ApiError` with an unrecognised code keeps its code
 * and borrows the server's message, and a thrown `TypeError` from a dropped
 * connection becomes `network`. No caller has to handle "and otherwise".
 */
export function resolveRoomsError(error: unknown): RoomsErrorResolution {
  if (error instanceof ApiError) {
    const known = KNOWN[error.code]
    if (known) {
      return {
        code: error.code as RoomsErrorCode,
        message: known.message,
        field: known.field,
        alreadySeated: known.alreadySeated ?? false,
        retryable: known.retryable ?? false,
      }
    }
    return {
      code: 'unknown',
      message: error.message || FALLBACK,
      field: null,
      alreadySeated: false,
      retryable: true,
    }
  }

  // `fetch` rejects with a TypeError when the request never reached a server.
  if (error instanceof TypeError) {
    const network = KNOWN.network
    return {
      code: 'network',
      message: network?.message ?? FALLBACK,
      field: null,
      alreadySeated: false,
      retryable: true,
    }
  }

  return {
    code: 'unknown',
    message: FALLBACK,
    field: null,
    alreadySeated: false,
    retryable: true,
  }
}
