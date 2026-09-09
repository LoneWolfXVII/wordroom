import type { Mode, Puzzle } from '@wordroom/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameApi } from './api'
import { clearPrefetched, prefetchedCount, prefetchPuzzle, takePrefetched } from './prefetch'

const ROOM = '11111111-1111-1111-1111-111111111111'
const request = (number: number, mode: Mode = 5) => ({ roomId: ROOM, mode, number })

const puzzle = (number: number): Puzzle => ({
  id: `p${number}`,
  roomId: ROOM,
  mode: 5,
  number,
})

/** A transport that records how many times the network was actually asked. */
function stubApi(impl?: (n: number) => Promise<Puzzle>) {
  const getPuzzle = vi.fn(async (input: { number: number }) =>
    impl ? impl(input.number) : puzzle(input.number),
  )
  return { getPuzzle } as unknown as GameApi & { getPuzzle: ReturnType<typeof vi.fn> }
}

beforeEach(() => clearPrefetched())

describe('prefetchPuzzle', () => {
  it('asks the transport once and hands the same promise back', async () => {
    const api = stubApi()
    prefetchPuzzle(api, request(2))

    const taken = takePrefetched(request(2))
    expect(taken).not.toBeNull()
    expect(await taken).toEqual(puzzle(2))
    // The whole point: taking it costs no second call.
    expect(api.getPuzzle).toHaveBeenCalledTimes(1)
  })

  it('does not fetch the same puzzle twice while one is in flight', () => {
    const api = stubApi()
    prefetchPuzzle(api, request(2))
    prefetchPuzzle(api, request(2))
    prefetchPuzzle(api, request(2))
    expect(api.getPuzzle).toHaveBeenCalledTimes(1)
  })

  it('keeps puzzles apart by room, mode and number', async () => {
    const api = stubApi()
    prefetchPuzzle(api, request(2, 5))
    prefetchPuzzle(api, request(2, 6))
    prefetchPuzzle(api, { roomId: 'other-room', mode: 5, number: 2 })
    expect(api.getPuzzle).toHaveBeenCalledTimes(3)

    // A prefetch for mode 6 must not satisfy a load of mode 5, or a player who
    // switched length would be handed the wrong board.
    expect(takePrefetched(request(2, 5))).not.toBeNull()
    expect(takePrefetched(request(2, 5))).toBeNull()
    expect(takePrefetched(request(2, 6))).not.toBeNull()
  })

  it('returns null for a puzzle nobody prefetched, so the caller fetches', () => {
    expect(takePrefetched(request(9))).toBeNull()
  })

  it('forgets a failed prefetch instead of caching the failure', async () => {
    // One offline moment must not poison the entry. If the rejection were kept,
    // every later attempt to open that puzzle would replay the same error and
    // the player could never advance.
    const api = stubApi(async () => {
      throw new Error('offline')
    })
    prefetchPuzzle(api, request(3))
    await vi.waitFor(() => expect(prefetchedCount()).toBe(0))
    expect(takePrefetched(request(3))).toBeNull()

    const healthy = stubApi()
    prefetchPuzzle(healthy, request(3))
    expect(await takePrefetched(request(3))).toEqual(puzzle(3))
  })

  it('does not leave an unhandled rejection behind', async () => {
    // The rejection is attached inside prefetchPuzzle. Without that, a prefetch
    // nobody consumed would surface as an unhandled promise rejection in the
    // player's browser, for a request they never made.
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    prefetchPuzzle(
      stubApi(async () => {
        throw new Error('offline')
      }),
      request(4),
    )
    await new Promise((resolve) => setTimeout(resolve, 20))
    process.off('unhandledRejection', unhandled)
    expect(unhandled).not.toHaveBeenCalled()
  })

  it('empties on clear, so another room starts clean', () => {
    const api = stubApi()
    prefetchPuzzle(api, request(2))
    prefetchPuzzle(api, request(3))
    expect(prefetchedCount()).toBe(2)
    clearPrefetched()
    expect(prefetchedCount()).toBe(0)
    expect(takePrefetched(request(2))).toBeNull()
  })

  it('holds nothing once a prefetch is taken', async () => {
    const api = stubApi()
    prefetchPuzzle(api, request(2))
    await takePrefetched(request(2))
    expect(prefetchedCount()).toBe(0)
  })
})
