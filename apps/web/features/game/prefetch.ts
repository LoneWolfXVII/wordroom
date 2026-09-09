import type { Mode, Puzzle } from '@wordroom/shared'
import type { GameApi } from './api'

/**
 * Fetching the next puzzle before it is asked for.
 *
 * `get_puzzle` costs about 2ms of server work when the puzzle already exists and
 * 10ms when it has to be derived. Everything else a player waits for is the
 * network: on a phone the same call measures around half a second, almost all of
 * it round trip. No amount of work on the query changes that number.
 *
 * What does change it is not making the request at that moment. The instant an
 * attempt ends, the player is looking at the result sheet, and they will be
 * looking at it for several seconds before they tap "Next puzzle". The request
 * goes out then, into time that was being spent anyway, and the tap resolves
 * against a promise that has usually already settled.
 *
 * A note on what this makes happen earlier: `get_puzzle` materialises the row.
 * Prefetching means a room's next puzzle exists slightly sooner than it used to.
 * Nothing is revealed by that — `room_puzzles` carries no answer — and the
 * sequence is fixed by the room's seed, so nobody's puzzle changes. It only
 * moves the moment a row is written.
 */

type Key = string

const key = (roomId: string, mode: Mode, number: number): Key => `${roomId}:${mode}:${number}`

/**
 * In-flight and settled prefetches, by puzzle.
 *
 * A rejected promise is removed as soon as it rejects rather than cached, so a
 * failed prefetch costs the player nothing — the next real load simply asks
 * again. Without that, one offline moment would poison the entry and every
 * later attempt to open that puzzle would replay the same error.
 */
const pending = new Map<Key, Promise<Puzzle>>()

/** Kick off a fetch for a puzzle nobody has asked for yet. Never throws. */
export function prefetchPuzzle(
  api: GameApi,
  input: { roomId: string; mode: Mode; number: number },
): void {
  const k = key(input.roomId, input.mode, input.number)
  if (pending.has(k)) return

  const promise = api.getPuzzle(input)
  pending.set(k, promise)

  // Attached here rather than at the call site so an unconsumed rejection never
  // reaches the window as an unhandled promise. The stored promise keeps its
  // rejection for whoever takes it; this branch only tidies the map.
  promise.catch(() => {
    if (pending.get(k) === promise) pending.delete(k)
  })
}

/**
 * The prefetched promise for a puzzle, if there is one. Removes it either way:
 * the caller owns it from here, and a puzzle that has been loaded once is held
 * by the store rather than by this map.
 */
export function takePrefetched(input: {
  roomId: string
  mode: Mode
  number: number
}): Promise<Puzzle> | null {
  const k = key(input.roomId, input.mode, input.number)
  const promise = pending.get(k)
  if (promise === undefined) return null
  pending.delete(k)
  return promise
}

/**
 * Forget everything. Called when the seat changes — a different room's puzzles
 * are not this room's, and the keys include the room id only so that a stale
 * entry cannot be served, never so that they accumulate across rooms.
 */
export function clearPrefetched(): void {
  pending.clear()
}

/** The number of entries held. For tests, so they can assert the map is tidy. */
export function prefetchedCount(): number {
  return pending.size
}
