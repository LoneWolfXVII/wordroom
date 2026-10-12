import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GameApiError } from './api'
import { createMockGameApi } from './dev/mock-api'
import { loadGuessList } from './guess-list'
import { useGameStore } from './store'

/** See keys.test.mts for why these files are `.mts`. */

const ROOM = { id: 'room-1', name: 'Friday crew', code: 'KHX7' }

/** The mock's 5-letter puzzle No. 1. */
const WORD = 'cream'

const store = () => useGameStore.getState()

async function start(settings?: { hardMode?: boolean }) {
  useGameStore.getState().reset()
  useGameStore.getState().configure({
    room: ROOM,
    mode: 5,
    api: createMockGameApi({ latencyMs: 0 }),
    settings: {
      timerMode: 'off',
      perPuzzleSeconds: 180,
      hardMode: settings?.hardMode ?? false,
    },
  })
  await store().loadPuzzle(5, 1)
}

/** Type a word and submit it, then land the reveal the way the hook would. */
async function play(word: string) {
  for (const letter of word) store().typeLetter(letter)
  await store().submit()
  store().finishReveal()
}

beforeEach(async () => {
  // The client spelling check is only active once the list is in memory.
  await loadGuessList(5)
  await start()
})

describe('typing', () => {
  it('fills the row and stops at the word length', () => {
    for (const letter of 'craned') store().typeLetter(letter)
    expect(store().current).toBe('crane')
  })

  it('ignores anything that is not a letter', () => {
    store().typeLetter('4')
    store().typeLetter('É')
    expect(store().current).toBe('')
  })

  it('deletes from the end and stops at empty', () => {
    for (const letter of 'cr') store().typeLetter(letter)
    store().deleteLetter()
    store().deleteLetter()
    store().deleteLetter()
    expect(store().current).toBe('')
  })
})

describe('an invalid word is not a guess', () => {
  it('rejects a short row without touching the network', async () => {
    for (const letter of 'cra') store().typeLetter(letter)
    const before = store().shakeToken
    await store().submit()

    expect(store().guesses).toHaveLength(0)
    expect(store().current).toBe('cra')
    expect(store().shakeToken).toBe(before + 1)
    expect(store().notice?.message).toBe('Not enough letters')
  })

  it('rejects a non-word from the client list, keeping the letters on the board', async () => {
    for (const letter of 'xzqjv') store().typeLetter(letter)
    await store().submit()

    expect(store().guesses).toHaveLength(0)
    expect(store().current).toBe('xzqjv')
    expect(store().notice?.message).toBe('Not a word')
    expect(store().status).toBe('playing')
  })

  it('rejects a hard-mode violation with the message that names the letter', async () => {
    await start({ hardMode: true })
    await loadGuessList(5)
    await play('crane') // c and r are green against CREAM

    for (const letter of 'sting') store().typeLetter(letter)
    await store().submit()

    expect(store().guesses).toHaveLength(1)
    expect(store().notice?.message).toBe('1st letter must be C')
  })
})

describe('a scored guess', () => {
  it('records the marks and blocks input until the reveal lands', async () => {
    for (const letter of 'crane') store().typeLetter(letter)
    await store().submit()

    expect(store().status).toBe('revealing')
    expect(store().revealingRow).toBe(0)
    expect(store().guesses[0]?.marks).toEqual([
      'correct',
      'correct',
      'present',
      'absent',
      'present',
    ])

    // Input is ignored mid-flip.
    store().typeLetter('a')
    expect(store().current).toBe('')

    store().finishReveal()
    expect(store().status).toBe('playing')
    expect(store().revealingRow).toBe(null)
  })

  it('accumulates key states as the row lands', async () => {
    await play('crane')
    expect(store().keyStates).toEqual({
      c: 'correct',
      r: 'correct',
      a: 'present',
      n: 'absent',
      e: 'present',
    })
  })
})

describe('the word stays server-side until the attempt is over', () => {
  it('is absent while the puzzle is in play', async () => {
    await play('crane')
    expect(store().revealedWord).toBe(null)
    expect(store().status).toBe('playing')
  })

  it('arrives with the solving guess', async () => {
    await play(WORD)
    expect(store().status).toBe('solved')
    expect(store().revealedWord).toBe(WORD)
    expect(store().bounceRow).toBe(0)
    expect(store().points).toBe(6)
  })

  it('arrives when the sixth guess is used up', async () => {
    for (let i = 0; i < 6; i++) await play('crane')
    expect(store().status).toBe('failed')
    expect(store().revealedWord).toBe(WORD)
    expect(store().points).toBe(0)
    expect(store().guesses).toHaveLength(6)
  })

  it('arrives on a timeout, which is a fail worth no points', async () => {
    await store().timeout()
    expect(store().status).toBe('failed')
    expect(store().revealedWord).toBe(WORD)
    expect(store().points).toBe(0)
    expect(store().guesses).toHaveLength(0)
  })
})

describe('next puzzle', () => {
  it('advances the number and wipes the board without waiting for anyone', async () => {
    await play(WORD)
    await store().nextPuzzle()

    expect(store().puzzle?.number).toBe(2)
    expect(store().guesses).toHaveLength(0)
    expect(store().keyStates).toEqual({})
    expect(store().revealedWord).toBe(null)
    expect(store().status).toBe('playing')
    expect(store().resultOpen).toBe(false)
  })
})

describe('settings', () => {
  it('applies a change from the next puzzle, never mid-puzzle', async () => {
    store().applySettings({ timerMode: 'off', perPuzzleSeconds: 180, hardMode: true })
    expect(store().hardMode).toBe(false)

    await store().nextPuzzle()
    expect(store().hardMode).toBe(true)
  })
})

describe('the result sheet', () => {
  it('only opens once there is a result to show', async () => {
    store().openResult()
    expect(store().resultOpen).toBe(false)

    await play(WORD)
    store().openResult()
    expect(store().resultOpen).toBe(true)

    store().closeResult()
    expect(store().resultOpen).toBe(false)
  })
})

describe('configure across rooms', () => {
  const roomA = { id: 'room-a', name: 'Alpha', code: 'AAAA' }
  const roomB = { id: 'room-b', name: 'Beta', code: 'BBBB' }

  it('clears the previous room state when pointed at a different room', () => {
    useGameStore.getState().reset()
    useGameStore.getState().configure({ room: roomA })
    useGameStore.setState({
      puzzle: { id: 'p1', roomId: roomA.id, mode: 5, number: 3 },
      guesses: [{ guess: 'crane', marks: ['absent', 'absent', 'absent', 'absent', 'absent'] }],
      current: 'sw',
      status: 'playing',
      revealedWord: null,
    })

    useGameStore.getState().configure({ room: roomB })

    const next = useGameStore.getState()
    expect(next.room?.id).toBe('room-b')
    expect(next.puzzle).toBeNull()
    expect(next.guesses).toEqual([])
    expect(next.current).toBe('')
    expect(next.status).toBe('idle')
    expect(next.numbers).toEqual({ 5: 1, 6: 1, 7: 1, 4: 1 })
  })

  it('keeps play state when reconfigured for the same room', () => {
    useGameStore.getState().reset()
    useGameStore.getState().configure({ room: roomA })
    const puzzle = { id: 'p1', roomId: roomA.id, mode: 5 as const, number: 3 }
    useGameStore.setState({ puzzle, current: 'sw' })

    useGameStore.getState().configure({ room: roomA })

    expect(useGameStore.getState().puzzle).toEqual(puzzle)
    expect(useGameStore.getState().current).toBe('sw')
  })
})

describe('the end of an attempt', () => {
  it('reopens the result after it has been dismissed', async () => {
    // Dismissing the drawer used to be a dead end: the keyboard stayed, every
    // key dead, with no way to the next puzzle and no way back to the result,
    // so the only escape was a reload. `openResult` was reachable only from the
    // settle timer in `useResultSheet` — nothing the player could press.
    await play(WORD)
    expect(store().status).toBe('solved')

    // What that timer does, once the reveal has settled.
    store().openResult()
    expect(store().resultOpen).toBe(true)

    store().closeResult()
    expect(store().resultOpen).toBe(false)

    store().openResult()
    expect(store().resultOpen).toBe(true)
  })

  it('does not mark the result dismissed until the player dismisses it', async () => {
    /*
     * This is the ordering the end-of-attempt actions depend on. The sheet
     * opens on a settle timer some way after the status flips; if the actions
     * appeared at the flip they would swap the keyboard out underneath a drawer
     * that was already sliding up. `resultDismissed` is what keeps them until
     * afterwards.
     */
    await play(WORD)
    expect(store().status).toBe('solved')
    // Attempt over, sheet not yet opened by the timer: nothing to show yet.
    expect(store().resultDismissed).toBe(false)

    store().openResult()
    expect(store().resultDismissed).toBe(false)

    store().closeResult()
    expect(store().resultDismissed).toBe(true)

    // Reopening from "View result" puts it back, so the actions hide again.
    store().openResult()
    expect(store().resultDismissed).toBe(false)
  })

  it('forgets the dismissal when the next puzzle arrives', async () => {
    await play(WORD)
    store().openResult()
    store().closeResult()
    expect(store().resultDismissed).toBe(true)

    await store().nextPuzzle()
    expect(store().resultDismissed).toBe(false)
    expect(store().resultOpen).toBe(false)
  })

  it('will not open a result for a puzzle still in play', async () => {
    // The actions replace the keyboard only once the attempt is over, and this
    // is the guard that keeps them from appearing mid-game.
    await play('slate')
    expect(store().status).toBe('playing')
    store().openResult()
    expect(store().resultOpen).toBe(false)
  })

  it('prefetches the next puzzle as soon as the server says the attempt is over', async () => {
    // Not when the reveal animation ends: measured against production that was
    // ~950ms later, and it is time a player who taps straight through waits for.
    const { clearPrefetched, prefetchedCount } = await import('./prefetch')
    clearPrefetched()
    await start()

    for (const letter of WORD) store().typeLetter(letter)
    await store().submit()

    // `submit` has resolved but `finishReveal` has not run: the reveal is still
    // animating, and the request must already be in flight.
    expect(store().status).toBe('revealing')
    expect(prefetchedCount()).toBe(1)
  })

  it('does not prefetch while the attempt is still going', async () => {
    const { clearPrefetched, prefetchedCount } = await import('./prefetch')
    clearPrefetched()
    await start()

    await play('slate')
    expect(store().status).toBe('playing')
    expect(prefetchedCount()).toBe(0)
  })
})

describe('switching to Four at once', () => {
  it('opened on Four, picking 5 leaves the puzzle to the resume rather than No. 1', async () => {
    const api = createMockGameApi({ latencyMs: 0 })
    const getPuzzle = vi.spyOn(api, 'getPuzzle')
    store().reset()
    store().configure({ room: ROOM, mode: 4, api })
    await store().setMode(5)
    expect(store().mode).toBe(5)
    expect(getPuzzle).not.toHaveBeenCalled()
  })

  it('stays on Four when picked while the first puzzle is still loading', async () => {
    store().reset()
    store().configure({ room: ROOM, mode: 5, api: createMockGameApi({ latencyMs: 30 }) })
    const loading = store().loadPuzzle(5, 1)
    await store().setMode(4)
    await loading
    expect(store().mode).toBe(4)
  })

  it('changes mode without loading a single-board puzzle, and comes back', async () => {
    const api = createMockGameApi({ latencyMs: 0 })
    const getPuzzle = vi.spyOn(api, 'getPuzzle')
    store().configure({ room: ROOM, api })
    const before = store().puzzle

    await store().setMode(4)
    expect(store().mode).toBe(4)
    // Four has its own store and screen; this one asks for nothing and keeps
    // the 5-letter puzzle it had.
    expect(getPuzzle).not.toHaveBeenCalled()
    expect(store().puzzle).toBe(before)
    expect(store().status).not.toBe('error')

    await store().setMode(5)
    expect(store().mode).toBe(5)
    expect(store().puzzle?.mode).toBe(5)
  })
})

describe('a refused next puzzle', () => {
  it('keeps the finished board and its buttons', async () => {
    const api = createMockGameApi({ latencyMs: 0 })
    const real = api.getPuzzle.bind(api)
    vi.spyOn(api, 'getPuzzle').mockImplementation(async (input) => {
      if (input.number === 1) return real(input)
      throw new GameApiError('round_not_over', 'The room is still on No. 1.')
    })
    store().reset()
    store().configure({ room: ROOM, mode: 5, api })
    await store().loadPuzzle(5, 1)
    await play(WORD)
    expect(store().status).toBe('solved')

    await store().nextPuzzle()
    expect(store().status).toBe('solved')
    expect(store().puzzle?.number).toBe(1)
    expect(store().notice?.message).toBe('The room is still on No. 1.')
  })

  it('stays on Four if the player switched to it while the load was failing', async () => {
    const api = createMockGameApi({ latencyMs: 0 })
    const real = api.getPuzzle.bind(api)
    let refuse: (error: Error) => void = () => {}
    vi.spyOn(api, 'getPuzzle').mockImplementation(async (input) => {
      if (input.number === 1) return real(input)
      return new Promise((_, reject) => {
        refuse = reject
      })
    })
    store().reset()
    store().configure({ room: ROOM, mode: 5, api })
    await store().loadPuzzle(5, 1)
    useGameStore.setState({ prefetchNext: false })
    await play(WORD)

    const next = store().nextPuzzle()
    await store().setMode(4)
    refuse(new GameApiError('round_not_over', 'The room is still on No. 1.'))
    await next
    expect(store().mode).toBe(4)
  })
})

describe('prefetching the next puzzle', () => {
  it('is skipped when the room asks for it off (Wait mode)', async () => {
    const api = createMockGameApi({ latencyMs: 0 })
    const getPuzzle = vi.spyOn(api, 'getPuzzle')
    store().reset()
    store().configure({ room: ROOM, mode: 5, api })
    useGameStore.setState({ prefetchNext: false })
    await store().loadPuzzle(5, 1)
    await play(WORD)
    expect(store().status).toBe('solved')
    expect(getPuzzle).toHaveBeenCalledTimes(1)
  })
})
