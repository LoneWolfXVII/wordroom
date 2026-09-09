import { afterEach, describe, expect, it } from 'vitest'
import { resolveResumeRoom, roomMark } from './resume-room'
import { type ActiveRoom, getActiveRoom, getActiveRoomId, setActiveRoom } from './storage'

const SEAT = { room: { id: 'room-1', name: 'wed' } }

/**
 * `storage.ts` reads `window` on every call rather than at import time, so a
 * fake can be installed per test. `throws` is Safari in private mode, which
 * raises on `localStorage` instead of handing back an empty store.
 */
function fakeWindow(options: { throws?: boolean; seed?: string } = {}) {
  const cells = new Map<string, string>()
  if (options.seed !== undefined) cells.set('wordroom.activeRoom', options.seed)

  const storage = {
    getItem(key: string) {
      if (options.throws) throw new Error('denied')
      return cells.get(key) ?? null
    },
    setItem(key: string, value: string) {
      if (options.throws) throw new Error('denied')
      cells.set(key, value)
    },
    removeItem(key: string) {
      if (options.throws) throw new Error('denied')
      cells.delete(key)
    },
  }

  const global = globalThis as { window?: unknown }
  global.window = { localStorage: storage, sessionStorage: storage }
  return cells
}

afterEach(() => {
  const global = globalThis as { window?: unknown }
  global.window = undefined
})

describe('resolveResumeRoom', () => {
  it('offers the cached room while the seat queries are still in flight', () => {
    // The regression: the card used to need `seat`, which is null until the
    // seats query *and* the room query have both come back.
    expect(
      resolveResumeRoom({ seat: null, hint: { id: 'room-1', name: 'wed' }, isLoading: true }),
    ).toEqual({ id: 'room-1', name: 'wed' })
  })

  it('prefers the settled seat over a cache that has drifted', () => {
    const hint: ActiveRoom = { id: 'room-9', name: 'stale' }
    expect(resolveResumeRoom({ seat: SEAT, hint, isLoading: false })).toEqual({
      id: 'room-1',
      name: 'wed',
    })
  })

  it('drops the card once the queries settle on no seat at all', () => {
    const hint: ActiveRoom = { id: 'room-1', name: 'wed' }
    expect(resolveResumeRoom({ seat: null, hint, isLoading: false })).toBeNull()
  })

  it('offers nothing on a genuine first visit, so nothing can shift into place', () => {
    expect(resolveResumeRoom({ seat: null, hint: null, isLoading: true })).toBeNull()
  })

  it('offers nothing for a cached id with no name, since there is nothing to show', () => {
    expect(
      resolveResumeRoom({ seat: null, hint: { id: 'room-1', name: null }, isLoading: true }),
    ).toBeNull()
  })
})

describe('the cache the first paint reads', () => {
  it('hands back the room the last visit stored, name and all', () => {
    fakeWindow()
    setActiveRoom({ id: 'room-1', name: 'wednesday' })

    // The whole point, end to end: everything the card needs, with no query.
    const painted = resolveResumeRoom({ seat: null, hint: getActiveRoom(), isLoading: true })
    expect(painted).toEqual({ id: 'room-1', name: 'wednesday' })
  })

  it('survives a 20-character name intact, for the truncation to deal with', () => {
    fakeWindow()
    const name = 'Wednesday Night Club'
    expect(name).toHaveLength(20)
    setActiveRoom({ id: 'room-1', name })
    expect(getActiveRoom()?.name).toBe(name)
  })

  it('reads a pre-name install as an id with no name', () => {
    fakeWindow({ seed: 'room-legacy' })
    expect(getActiveRoom()).toEqual({ id: 'room-legacy', name: null })
    expect(getActiveRoomId()).toBe('room-legacy')
  })

  it('forgets the room when it is cleared', () => {
    fakeWindow()
    setActiveRoom({ id: 'room-1', name: 'wed' })
    setActiveRoom(null)
    expect(getActiveRoom()).toBeNull()
  })

  it('reads and writes without throwing where storage is blocked', () => {
    fakeWindow({ throws: true })
    expect(() => setActiveRoom({ id: 'room-1', name: 'wed' })).not.toThrow()
    expect(getActiveRoom()).toBeNull()
  })

  it('ignores a value that is not a room', () => {
    fakeWindow({ seed: '{"name":"wed"}' })
    expect(getActiveRoom()).toBeNull()
  })
})

describe('roomMark', () => {
  it('is the room initial, upper case', () => {
    expect(roomMark('wed')).toBe('W')
  })

  it('skips leading space rather than marking the tile blank', () => {
    expect(roomMark('  wednesday night  ')).toBe('W')
  })

  it('keeps an emoji whole instead of splitting the surrogate pair', () => {
    expect(roomMark('🎲 club')).toBe('🎲')
  })

  it('is empty for a name with nothing in it', () => {
    expect(roomMark('   ')).toBe('')
  })
})
