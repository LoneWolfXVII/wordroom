// Vitest, and deliberately `.mts`.
//
// `apps/web` has no Vitest runner yet — its `test` script is a stub and the
// package has no `vitest` dependency — and `apps/web/package.json` belongs to
// another workstream, so workstream 4 cannot add one. `tsconfig.json` includes
// `**/*.ts`, which would fail on the import below; it does not match `.mts`.
//
// These specs are real and run today against any Vitest in the workspace. Once
// `vitest` is a dependency of this package, rename this file back to `.ts` so
// it is typechecked with the rest of the app.
import { describe, expect, it } from 'vitest'
import {
  ATTEMPT_PUBLIC_COLUMNS,
  ATTEMPT_PUBLIC_SELECT,
  forbiddenColumns,
  narrowAttempt,
} from './answer-free'

/** What a realtime payload for `attempts` looks like, plus the revoked column. */
const payload = {
  id: 'attempt-1',
  player_id: 'player-1',
  puzzle_id: 'puzzle-1',
  marks: ['correct,present,absent,absent,correct'],
  solved: true,
  guess_count: 4,
  elapsed_ms: 98_000,
  timer_mode: 'off',
  hard_mode: false,
  started_at: '2026-09-08T10:00:00Z',
  finished_at: '2026-09-08T10:01:38Z',
  guesses: ['crane', 'sound', 'sting', 'swing'],
}

describe('narrowAttempt', () => {
  it('drops guesses, because a solved attempt ends on the answer', () => {
    const narrowed = narrowAttempt(payload)
    expect(narrowed).not.toHaveProperty('guesses')
    expect(Object.keys(narrowed)).not.toContain('guesses')
  })

  it('keeps every column the room is granted', () => {
    const narrowed = narrowAttempt(payload)
    for (const column of ATTEMPT_PUBLIC_COLUMNS) {
      expect(narrowed).toHaveProperty(column)
    }
    expect(narrowed.marks).toEqual(payload.marks)
  })

  it('drops any column added to the table later', () => {
    const narrowed = narrowAttempt({ ...payload, answer: 'swing', revealed_word: 'swing' })
    expect(Object.keys(narrowed).sort()).toEqual([...ATTEMPT_PUBLIC_COLUMNS].sort())
  })

  it('survives an empty or malformed payload', () => {
    expect(narrowAttempt(null)).toEqual({})
    expect(narrowAttempt(undefined)).toEqual({})
    expect(narrowAttempt('swing')).toEqual({})
    expect(narrowAttempt({})).toEqual({})
  })
})

describe('forbiddenColumns', () => {
  it('names what should not have arrived', () => {
    expect(forbiddenColumns(payload)).toEqual(['guesses'])
  })

  it('is empty for a clean payload', () => {
    const { guesses: _guesses, ...clean } = payload
    expect(forbiddenColumns(clean)).toEqual([])
  })
})

describe('ATTEMPT_PUBLIC_SELECT', () => {
  it('is an explicit column list, never a star', () => {
    expect(ATTEMPT_PUBLIC_SELECT).not.toContain('*')
    expect(ATTEMPT_PUBLIC_SELECT).not.toContain('guesses')
    expect(ATTEMPT_PUBLIC_SELECT).toContain('marks')
  })
})
