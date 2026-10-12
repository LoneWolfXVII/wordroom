import type { MarkRow } from '@wordroom/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type FourGame, type GameApi, GameApiError } from '@/features/game/api'
import { quadKeyStates, useFourStore } from './store'

const absent: MarkRow = ['absent', 'absent', 'absent', 'absent', 'absent']
const solved: MarkRow = ['correct', 'correct', 'correct', 'correct', 'correct']

function game(overrides: Partial<FourGame> = {}): FourGame {
  return {
    roomId: 'r1',
    number: 1,
    boards: [1, 2, 3, 4].map((n) => ({
      board: n as 1 | 2 | 3 | 4,
      puzzleId: `p${n}`,
      marks: [],
      guessCount: 0,
      solved: false,
      word: null,
    })),
    guesses: [],
    finished: false,
    points: null,
    ...overrides,
  }
}

function fakeApi(overrides: Partial<GameApi> = {}): GameApi {
  return {
    getPuzzle: vi.fn(),
    submitGuess: vi.fn(),
    submitTimeout: vi.fn(),
    getFour: vi.fn(async ({ number }) => game({ number })),
    submitFourGuess: vi.fn(async ({ guess }) =>
      game({
        guesses: [guess],
        boards: game().boards.map((b) => ({ ...b, marks: [absent], guessCount: 1 })),
      }),
    ),
    ...overrides,
  }
}

async function ready(api: GameApi) {
  useFourStore.getState().reset()
  useFourStore.getState().configure({ roomId: 'r1', api })
  await useFourStore.getState().load(1)
}

const type = (word: string) => {
  for (const letter of word) useFourStore.getState().typeLetter(letter)
}

describe('Four store', () => {
  beforeEach(() => useFourStore.getState().reset())

  it('loads a game and starts playing', async () => {
    await ready(fakeApi())
    expect(useFourStore.getState().status).toBe('playing')
    expect(useFourStore.getState().game?.number).toBe(1)
  })

  it('types up to five letters and deletes one', async () => {
    await ready(fakeApi())
    type('cranes')
    expect(useFourStore.getState().current).toBe('crane')
    useFourStore.getState().deleteLetter()
    expect(useFourStore.getState().current).toBe('cran')
  })

  it('shakes a short word without asking the server', async () => {
    const api = fakeApi()
    await ready(api)
    type('cran')
    await useFourStore.getState().submit()
    expect(api.submitFourGuess).not.toHaveBeenCalled()
    expect(useFourStore.getState().shakeToken).toBe(1)
    expect(useFourStore.getState().notice?.message).toBe('Not enough letters')
  })

  it('keeps the letters and shakes when the word is not a word', async () => {
    const api = fakeApi({
      submitFourGuess: vi.fn(async () => {
        throw new GameApiError('not_a_word', 'Not in word list.')
      }),
    })
    await ready(api)
    type('zzzzz')
    await useFourStore.getState().submit()
    expect(useFourStore.getState().current).toBe('zzzzz')
    expect(useFourStore.getState().shakeToken).toBe(1)
    expect(useFourStore.getState().notice?.message).toBe('Not in word list.')
  })

  it('clears the row and takes the new game after a guess', async () => {
    await ready(fakeApi())
    type('slate')
    await useFourStore.getState().submit()
    expect(useFourStore.getState().current).toBe('')
    expect(useFourStore.getState().game?.guesses).toEqual(['slate'])
    expect(useFourStore.getState().status).toBe('playing')
  })

  it('is won when every board is solved, and over otherwise', async () => {
    const all = game().boards.map((b) => ({ ...b, solved: true, guessCount: 4, word: 'crane' }))
    await ready(
      fakeApi({
        submitFourGuess: vi.fn(async () => game({ boards: all, finished: true, points: 24 })),
      }),
    )
    type('crane')
    await useFourStore.getState().submit()
    expect(useFourStore.getState().status).toBe('won')

    const some = all.map((b, i) => (i === 3 ? { ...b, solved: false } : b))
    await ready(
      fakeApi({
        submitFourGuess: vi.fn(async () => game({ boards: some, finished: true, points: 18 })),
      }),
    )
    type('crane')
    await useFourStore.getState().submit()
    expect(useFourStore.getState().status).toBe('over')
  })

  it('keeps the finished game on screen when the next one fails to load', async () => {
    const all = game().boards.map((b) => ({ ...b, solved: true, guessCount: 4, word: 'crane' }))
    let calls = 0
    const api = fakeApi({
      getFour: vi.fn(async () => {
        calls += 1
        if (calls === 1) return game({ boards: all, finished: true, points: 24 })
        throw new GameApiError('offline', 'No connection. Reconnect to play.')
      }),
    })
    await ready(api)
    await useFourStore.getState().next()
    // Still on the finished game, so "Next puzzle" is there to try again.
    expect(useFourStore.getState().status).toBe('won')
    expect(useFourStore.getState().game?.number).toBe(1)
    expect(useFourStore.getState().notice?.message).toBe('No connection. Reconnect to play.')
  })

  it('reports an error when there is no game to fall back on, and retries', async () => {
    let fail = true
    const api = fakeApi({
      getFour: vi.fn(async ({ number }) => {
        if (fail) throw new GameApiError('internal', 'Something went wrong. Try again.')
        return game({ number })
      }),
    })
    await ready(api)
    expect(useFourStore.getState().status).toBe('error')
    fail = false
    await useFourStore.getState().retry()
    expect(useFourStore.getState().status).toBe('playing')
  })

  it('moves on to the next game', async () => {
    const api = fakeApi()
    await ready(api)
    await useFourStore.getState().next()
    expect(api.getFour).toHaveBeenLastCalledWith({ roomId: 'r1', number: 2 })
    expect(useFourStore.getState().game?.number).toBe(2)
  })
})

describe('quadKeyStates', () => {
  it('reports each letter per board, best mark winning', () => {
    const g = game({
      guesses: ['crane', 'slate'],
      boards: [
        {
          board: 1,
          puzzleId: 'p1',
          marks: [['present', 'absent', 'absent', 'absent', 'absent'], absent],
          guessCount: 2,
          solved: false,
          word: null,
        },
        { board: 2, puzzleId: 'p2', marks: [solved], guessCount: 1, solved: true, word: 'crane' },
        {
          board: 3,
          puzzleId: 'p3',
          marks: [absent, absent],
          guessCount: 2,
          solved: false,
          word: null,
        },
        { board: 4, puzzleId: 'p4', marks: [], guessCount: 0, solved: false, word: null },
      ],
    })
    const states = quadKeyStates(g)
    expect(states.c).toEqual(['present', 'correct', 'absent', null])
    // Board 2 was solved on the first guess, so `slate` never reached it.
    expect(states.s).toEqual(['absent', null, 'absent', null])
    expect(states.z).toBeUndefined()
  })

  it('is empty before a game', () => {
    expect(quadKeyStates(null)).toEqual({})
  })
})
