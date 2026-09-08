import { describe, expect, it } from 'vitest'
import { resumePuzzleNumber } from './resume'

/**
 * A stand-in for the two answer-free reads. Each `from()` returns a thenable
 * builder, which is the shape supabase-js queries have.
 */
function client(puzzles: unknown, attempts: unknown, fail?: 'puzzles' | 'attempts') {
  const table = (data: unknown, errored: boolean) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      // biome-ignore lint/suspicious/noThenProperty: a supabase-js query builder is a thenable, so the double must be one too
      then: (resolve: (r: unknown) => void) =>
        resolve(errored ? { data: null, error: new Error('nope') } : { data, error: null }),
    }
    return builder
  }
  return {
    from: (name: string) =>
      name === 'room_puzzles'
        ? table(puzzles, fail === 'puzzles')
        : table(attempts, fail === 'attempts'),
    // biome-ignore lint/suspicious/noExplicitAny: a hand-rolled test double
  } as any
}

const P = [
  { id: 'a', number: 1 },
  { id: 'b', number: 2 },
  { id: 'c', number: 3 },
]

describe('resumePuzzleNumber', () => {
  it('starts a new player at No. 1', async () => {
    expect((await resumePuzzleNumber(client([], []), 'room', 5)).number).toBe(1)
  })

  it('carries on after the highest finished puzzle', async () => {
    const attempts = [
      { puzzle_id: 'a', finished_at: '2026-09-08T00:00:00Z' },
      { puzzle_id: 'b', finished_at: '2026-09-08T00:01:00Z' },
    ]
    expect((await resumePuzzleNumber(client(P, attempts), 'room', 5)).number).toBe(3)
  })

  it('resumes an unfinished attempt rather than skipping past it', async () => {
    const attempts = [
      { puzzle_id: 'a', finished_at: '2026-09-08T00:00:00Z' },
      { puzzle_id: 'b', finished_at: null },
    ]
    expect((await resumePuzzleNumber(client(P, attempts), 'room', 5)).number).toBe(2)
  })

  it('returns the earliest unfinished attempt when there is more than one', async () => {
    const attempts = [
      { puzzle_id: 'c', finished_at: null },
      { puzzle_id: 'b', finished_at: null },
    ]
    expect((await resumePuzzleNumber(client(P, attempts), 'room', 5)).number).toBe(2)
  })

  it('ignores an attempt on a puzzle from another room or mode', async () => {
    const attempts = [{ puzzle_id: 'elsewhere', finished_at: '2026-09-08T00:00:00Z' }]
    expect((await resumePuzzleNumber(client(P, attempts), 'room', 5)).number).toBe(1)
  })

  it('falls back to No. 1 rather than blocking the game when a read fails', async () => {
    expect((await resumePuzzleNumber(client(P, [], 'attempts'), 'room', 5)).number).toBe(1)
    expect((await resumePuzzleNumber(client(P, [], 'puzzles'), 'room', 5)).number).toBe(1)
  })
})

describe('restoring an in-progress board', () => {
  it('returns the guesses and marks the server still holds', async () => {
    const attempts = [
      {
        id: 'attempt-1',
        puzzle_id: 'b',
        finished_at: null,
        guesses: ['crane', 'spilt'],
        marks: ['absent,absent,present,absent,absent', 'correct,absent,absent,absent,absent'],
      },
    ]
    const point = await resumePuzzleNumber(client(P, attempts), 'room', 5)
    expect(point.number).toBe(2)
    expect(point.restore?.attemptId).toBe('attempt-1')
    expect(point.restore?.guesses).toEqual([
      { guess: 'crane', marks: ['absent', 'absent', 'present', 'absent', 'absent'] },
      { guess: 'spilt', marks: ['correct', 'absent', 'absent', 'absent', 'absent'] },
    ])
  })

  it('drops a board whose marks do not decode rather than showing a wrong one', async () => {
    const attempts = [
      { id: 'a1', puzzle_id: 'b', finished_at: null, guesses: ['crane'], marks: ['nonsense'] },
    ]
    const point = await resumePuzzleNumber(client(P, attempts), 'room', 5)
    expect(point.number).toBe(2)
    expect(point.restore).toBeUndefined()
  })

  it('drops a board whose rows and marks disagree in length', async () => {
    const attempts = [
      {
        id: 'a1',
        puzzle_id: 'b',
        finished_at: null,
        guesses: ['crane', 'spilt'],
        marks: ['absent,absent,absent,absent,absent'],
      },
    ]
    expect((await resumePuzzleNumber(client(P, attempts), 'room', 5)).restore).toBeUndefined()
  })

  it('restores nothing for a finished attempt', async () => {
    const attempts = [
      {
        id: 'a1',
        puzzle_id: 'a',
        finished_at: '2026-09-08T00:00:00Z',
        guesses: ['crane'],
        marks: ['correct,correct,correct,correct,correct'],
      },
    ]
    const point = await resumePuzzleNumber(client(P, attempts), 'room', 5)
    expect(point.number).toBe(2)
    expect(point.restore).toBeUndefined()
  })
})
