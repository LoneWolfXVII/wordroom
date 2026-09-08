import { describe, expect, it } from 'vitest'
import { ATTEMPT_PUBLIC_COLUMNS } from '@/features/leaderboard/answer-free'
import {
  attemptStatus,
  isFinished,
  type MemberPuzzleStatus,
  statusesByPlayer,
  statusLabel,
} from './puzzle-status'

const PRIYA = '11111111-1111-4111-8111-111111111111'
const ARJUN = '22222222-2222-4222-8222-222222222222'

/** A row shaped the way PostgREST returns one, with every allowlisted column. */
function attempt(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'aaaaaaaa-1111-4111-8111-111111111111',
    player_id: PRIYA,
    puzzle_id: 'pppppppp-1111-4111-8111-111111111111',
    marks: ['absent,present,absent,absent,correct'],
    solved: false,
    guess_count: 1,
    elapsed_ms: 4200,
    timer_mode: 'off',
    hard_mode: false,
    started_at: '2026-09-08T12:00:00.000Z',
    finished_at: null,
    ...overrides,
  }
}

describe('attemptStatus', () => {
  it('reads a solve as solved, not as a miss', () => {
    // `attempts_solved_finished` means a solve always has finished_at set, so
    // testing finished_at first would call every solve a miss.
    const status = attemptStatus({
      solved: true,
      finished_at: '2026-09-08T12:01:00.000Z',
      guess_count: 3,
    })
    expect(status).toBe('solved')
  })

  it('reads a finished, unsolved attempt as missed', () => {
    expect(
      attemptStatus({ solved: false, finished_at: '2026-09-08T12:01:00.000Z', guess_count: 6 }),
    ).toBe('missed')
  })

  it('reads a timeout — finished with guesses left — as missed', () => {
    expect(
      attemptStatus({ solved: false, finished_at: '2026-09-08T12:01:00.000Z', guess_count: 2 }),
    ).toBe('missed')
  })

  it('reads an open attempt with at least one guess as playing', () => {
    expect(attemptStatus({ solved: false, finished_at: null, guess_count: 1 })).toBe('playing')
  })

  it('reads an open attempt with no guesses as waiting', () => {
    expect(attemptStatus({ solved: false, finished_at: null, guess_count: 0 })).toBe('waiting')
  })

  it('treats a missing record as waiting rather than throwing', () => {
    expect(attemptStatus({})).toBe('waiting')
  })

  it('does not mistake an undefined finished_at for a finished attempt', () => {
    // `narrowAttempt` drops unknown keys, so a partial record is a real shape
    // here: absent must not read the same as a timestamp.
    expect(attemptStatus({ solved: false, guess_count: 2 })).toBe('playing')
  })
})

describe('isFinished', () => {
  it('is true exactly for the two ways a puzzle ends', () => {
    expect(isFinished('solved')).toBe(true)
    expect(isFinished('missed')).toBe(true)
    expect(isFinished('playing')).toBe(false)
    expect(isFinished('waiting')).toBe(false)
  })
})

describe('statusLabel', () => {
  it('captions the three states worth naming', () => {
    expect(statusLabel('solved')).toBe('solved')
    expect(statusLabel('missed')).toBe('missed')
    expect(statusLabel('playing')).toBe('playing')
  })

  it('says nothing for someone who has not started', () => {
    expect(statusLabel('waiting')).toBeNull()
  })

  it('never uses the trademarked name', () => {
    const statuses: MemberPuzzleStatus[] = ['solved', 'missed', 'playing', 'waiting']
    for (const status of statuses) {
      expect(statusLabel(status)?.toLowerCase() ?? '').not.toContain('wordle')
    }
  })
})

describe('statusesByPlayer', () => {
  it('keys each row by its player', () => {
    const statuses = statusesByPlayer([
      attempt({ player_id: PRIYA, solved: true, finished_at: '2026-09-08T12:01:00.000Z' }),
      attempt({ player_id: ARJUN, guess_count: 2 }),
    ])

    expect(statuses[PRIYA]).toBe('solved')
    expect(statuses[ARJUN]).toBe('playing')
  })

  it('leaves a player with no row out, so they read as waiting', () => {
    const statuses = statusesByPlayer([attempt({ player_id: PRIYA })])
    expect(statuses[ARJUN]).toBeUndefined()
  })

  it('drops a row with no usable player id instead of keying on empty string', () => {
    expect(statusesByPlayer([attempt({ player_id: null }), attempt({ player_id: '' })])).toEqual({})
  })

  it('survives rows that are not objects at all', () => {
    expect(statusesByPlayer([null, undefined, 42, 'nope'])).toEqual({})
  })

  /**
   * The one that matters. A solved attempt's last guess is the answer, so a
   * `guesses` array must not survive the fold even if a row somehow arrives
   * carrying one — a widened grant, a hand-written query, a future column.
   */
  it('never lets a guess through, however a row arrives carrying one', () => {
    const leaky = attempt({
      player_id: PRIYA,
      solved: true,
      finished_at: '2026-09-08T12:01:00.000Z',
      guesses: ['slate', 'crane'],
    })

    const statuses = statusesByPlayer([leaky])

    expect(statuses[PRIYA]).toBe('solved')
    // The fold produces statuses and nothing else: there is no field on the
    // result for a word to sit in.
    expect(JSON.stringify(statuses)).not.toContain('crane')
    expect(JSON.stringify(statuses)).not.toContain('slate')
    expect(Object.values(statuses)).toEqual(['solved'])
  })

  it('reads only columns the room is actually granted', () => {
    // Guards against this file drifting from workstream 4's allowlist, which is
    // itself a copy of the column grant in the RLS migration.
    for (const column of ['player_id', 'solved', 'finished_at', 'guess_count'] as const) {
      expect(ATTEMPT_PUBLIC_COLUMNS).toContain(column)
    }
    expect(ATTEMPT_PUBLIC_COLUMNS).not.toContain('guesses')
  })
})
