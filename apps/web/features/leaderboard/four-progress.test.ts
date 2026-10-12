import { describe, expect, it } from 'vitest'
import { fourProgress } from './four-progress'

// Game 2's boards are puzzles 5-8.
const boards = new Map([
  ['p5', 1],
  ['p6', 2],
  ['p7', 3],
  ['p8', 4],
])

const attempt = (
  player: string,
  puzzle: string,
  fields: { solved?: boolean; guess_count?: number; finished_at?: string | null } = {},
) => ({
  player_id: player,
  puzzle_id: puzzle,
  solved: false,
  guess_count: 3,
  finished_at: null,
  ...fields,
})

describe('fourProgress', () => {
  it('lists the guess each board was solved on, in board order', () => {
    const [ana] = fourProgress(
      [
        attempt('ana', 'p7', { solved: true, guess_count: 5, finished_at: 't' }),
        attempt('ana', 'p5', { solved: true, guess_count: 2, finished_at: 't' }),
        attempt('ana', 'p6'),
        attempt('ana', 'p8'),
      ],
      boards,
    )
    expect(ana?.solvedAt).toEqual([2, null, 5, null])
    expect(ana?.status).toBe('playing')
    expect(ana?.grid).toEqual([])
  })

  it('is solved when all four are, failed when it ended otherwise', () => {
    const done = { finished_at: 't' }
    const result = fourProgress(
      [
        ...['p5', 'p6', 'p7', 'p8'].map((p, i) =>
          attempt('ana', p, { ...done, solved: true, guess_count: i + 2 }),
        ),
        ...['p5', 'p6', 'p7', 'p8'].map((p) => attempt('bo', p, { ...done, guess_count: 9 })),
      ],
      boards,
    )
    expect(result.find((p) => p.playerId === 'ana')?.status).toBe('solved')
    expect(result.find((p) => p.playerId === 'bo')?.status).toBe('failed')
  })

  it('ignores attempts on puzzles outside the game', () => {
    expect(fourProgress([attempt('ana', 'p1')], boards)).toEqual([])
  })
})
