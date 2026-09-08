import { MAX_PLAYERS } from '@wordroom/shared'
import { describe, expect, it } from 'vitest'
import { ApiError, parseErrorEnvelope, resolveRoomsError } from './errors'

describe('parseErrorEnvelope', () => {
  it('reads the documented envelope', () => {
    const error = parseErrorEnvelope({
      error: { code: 'room_full', message: 'This room is full.', details: {} },
    })
    expect(error).toBeInstanceOf(ApiError)
    expect(error?.code).toBe('room_full')
    expect(error?.message).toBe('This room is full.')
  })

  it('keeps the details a code carries', () => {
    const error = parseErrorEnvelope({
      error: { code: 'puzzle_out_of_sequence', message: 'No.', details: { reached: 3, next: 4 } },
    })
    expect(error?.details).toEqual({ reached: 3, next: 4 })
  })

  it('copes with message and details absent', () => {
    const error = parseErrorEnvelope({ error: { code: 'internal' } })
    expect(error?.code).toBe('internal')
    expect(error?.details).toEqual({})
  })

  it('returns null for a body that is not an envelope', () => {
    // A proxy timeout serving an HTML error page, or a success body by mistake.
    expect(parseErrorEnvelope('<html>504</html>')).toBeNull()
    expect(parseErrorEnvelope({ room: { id: 'x' } })).toBeNull()
    expect(parseErrorEnvelope(null)).toBeNull()
    expect(parseErrorEnvelope({ error: 'room_full' })).toBeNull()
  })
})

describe('resolveRoomsError', () => {
  const resolve = (code: string, message = '') => resolveRoomsError(new ApiError(code, message))

  it('sends an unknown code back to the code field', () => {
    const resolved = resolve('room_not_found')
    expect(resolved.field).toBe('code')
    expect(resolved.alreadySeated).toBe(false)
  })

  it('sends a full room back to the code field, and names the limit', () => {
    const resolved = resolve('room_full')
    expect(resolved.field).toBe('code')
    expect(resolved.message).toContain(String(MAX_PLAYERS))
  })

  it('sends a taken name back to the name field', () => {
    const resolved = resolve('name_taken')
    expect(resolved.field).toBe('playerName')
    expect(resolved.message).toBe('Someone in this room already has that name.')
  })

  it('treats already_joined as seated rather than as a failure to fix', () => {
    // Names are locked, so there is nothing the player could change. The only
    // sensible response is to open the room they are already in.
    const resolved = resolve('already_joined')
    expect(resolved.alreadySeated).toBe(true)
    expect(resolved.field).toBeNull()
  })

  it('marks the transient codes retryable and the permanent ones not', () => {
    expect(resolve('rate_limited').retryable).toBe(true)
    expect(resolve('internal').retryable).toBe(true)
    expect(resolve('code_unavailable').retryable).toBe(true)
    expect(resolve('room_not_found').retryable).toBe(false)
    expect(resolve('name_taken').retryable).toBe(false)
  })

  it('prefers its own copy over the server message for a known code', () => {
    // The server's message is written for an API consumer; the screen's is not.
    const resolved = resolve('room_full', 'This room is full.')
    expect(resolved.message).not.toBe('This room is full.')
    expect(resolved.message).toContain('full')
  })

  it('falls back to the server message for a code it has never seen', () => {
    const resolved = resolve('some_future_code', 'Something specific happened.')
    expect(resolved.code).toBe('unknown')
    expect(resolved.message).toBe('Something specific happened.')
    expect(resolved.retryable).toBe(true)
  })

  it('still says something useful when an unknown code carries no message', () => {
    expect(resolve('some_future_code').message).toBeTruthy()
  })

  it('reads a failed fetch as a network problem', () => {
    // `fetch` rejects with a TypeError when the request never reached a server.
    const resolved = resolveRoomsError(new TypeError('Failed to fetch'))
    expect(resolved.code).toBe('network')
    expect(resolved.retryable).toBe(true)
  })

  it('is total — anything at all resolves to something renderable', () => {
    for (const thrown of [undefined, null, 'a string', 42, {}, new Error('boom')]) {
      const resolved = resolveRoomsError(thrown)
      expect(resolved.message).toBeTruthy()
      expect(resolved.alreadySeated).toBe(false)
    }
  })
})
