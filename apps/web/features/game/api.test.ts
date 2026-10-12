import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGameApi, GameApiError } from './api'

const config = {
  restUrl: 'http://db.test/rest/v1',
  anonKey: 'anon',
  getAccessToken: async () => 'token',
}

function respond(body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const board = (n: number, extra: Record<string, unknown> = {}) => ({
  board: n,
  puzzleId: `p${n}`,
  attemptId: null,
  marks: [],
  guessCount: 0,
  solved: false,
  word: null,
  ...extra,
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Four at once API', () => {
  it('reads a game, decoding marks and keeping only revealed words', async () => {
    const fetchMock = respond({
      game: {
        roomId: 'r1',
        number: 3,
        boards: [
          board(1, { marks: ['absent,absent,present,correct,absent'], guessCount: 1 }),
          board(2, {
            marks: ['correct,correct,correct,correct,correct'],
            guessCount: 1,
            solved: true,
            word: 'crane',
          }),
          board(3, { marks: ['absent,absent,absent,absent,absent'], guessCount: 1 }),
          board(4, { marks: ['present,absent,absent,absent,absent'], guessCount: 1 }),
        ],
        guesses: ['crane'],
        finished: false,
        points: null,
      },
    })

    const game = await createGameApi(config).getFour({ roomId: 'r1', number: 3 })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://db.test/rest/v1/rpc/get_four',
      expect.objectContaining({ body: JSON.stringify({ p_room_id: 'r1', p_number: 3 }) }),
    )
    expect(game.number).toBe(3)
    expect(game.boards).toHaveLength(4)
    expect(game.boards[0]?.marks).toEqual([['absent', 'absent', 'present', 'correct', 'absent']])
    expect(game.boards[1]?.solved).toBe(true)
    expect(game.boards[1]?.word).toBe('crane')
    expect(game.boards[0]?.word).toBeNull()
    expect(game.guesses).toEqual(['crane'])
    expect(game.finished).toBe(false)
  })

  it('submits a guess with the elapsed time', async () => {
    const fetchMock = respond({
      game: {
        roomId: 'r1',
        number: 1,
        boards: [board(1), board(2), board(3), board(4)],
        guesses: [],
        finished: false,
        points: null,
      },
    })

    await createGameApi(config).submitFourGuess({
      roomId: 'r1',
      number: 1,
      guess: 'slate',
      elapsedMs: 4200,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://db.test/rest/v1/rpc/submit_four_guess',
      expect.objectContaining({
        body: JSON.stringify({
          p_room_id: 'r1',
          p_number: 1,
          p_guess: 'slate',
          p_elapsed_ms: 4200,
        }),
      }),
    )
  })

  it('turns an error body into a GameApiError with its code', async () => {
    respond({ error: { code: 'not_a_word', message: 'Not in word list.' } })
    const failure = createGameApi(config).submitFourGuess({
      roomId: 'r1',
      number: 1,
      guess: 'zzzzz',
    })
    await expect(failure).rejects.toBeInstanceOf(GameApiError)
    await expect(failure).rejects.toMatchObject({ code: 'not_a_word' })
  })

  it('refuses a game that does not have four boards', async () => {
    respond({ game: { roomId: 'r1', number: 1, boards: [board(1)], guesses: [], finished: false } })
    await expect(createGameApi(config).getFour({ roomId: 'r1', number: 1 })).rejects.toMatchObject({
      code: 'internal',
    })
  })
})
