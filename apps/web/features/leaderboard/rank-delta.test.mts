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
import { beforeEach, describe, expect, it } from 'vitest'
import { ordinal } from './format'
import {
  clearRankMemory,
  rankDelta,
  rankMemoryKey,
  readPreviousRank,
  readRank,
  recordRank,
} from './rank-delta'

describe('ordinal', () => {
  it('names the usual suffixes', () => {
    expect(ordinal(1)).toBe('1st')
    expect(ordinal(2)).toBe('2nd')
    expect(ordinal(3)).toBe('3rd')
    expect(ordinal(4)).toBe('4th')
  })

  it('keeps the teens on th', () => {
    expect(ordinal(11)).toBe('11th')
    expect(ordinal(12)).toBe('12th')
    expect(ordinal(13)).toBe('13th')
    expect(ordinal(21)).toBe('21st')
    expect(ordinal(112)).toBe('112th')
  })
})

describe('rankDelta', () => {
  it('counts a climb as positive movement', () => {
    const delta = rankDelta(4, 2)
    expect(delta.direction).toBe('up')
    expect(delta.moved).toBe(2)
    expect(delta.improved).toBe(true)
    expect(delta.label).toBe('↑ 2nd')
  })

  it('counts a drop as negative movement', () => {
    const delta = rankDelta(2, 5)
    expect(delta.direction).toBe('down')
    expect(delta.moved).toBe(-3)
    expect(delta.improved).toBe(false)
    expect(delta.label).toBe('↓ 5th')
  })

  it('holds still without an arrow', () => {
    const delta = rankDelta(3, 3)
    expect(delta.direction).toBe('same')
    expect(delta.moved).toBe(0)
    expect(delta.label).toBe('3rd')
  })

  it('treats an unknown previous rank as new to the board', () => {
    const delta = rankDelta(null, 1)
    expect(delta.direction).toBe('new')
    expect(delta.before).toBeNull()
    expect(delta.moved).toBe(0)
    expect(delta.improved).toBe(false)
    expect(delta.label).toBe('1st')
  })

  it('rejects a nonsense previous rank rather than inventing a climb', () => {
    expect(rankDelta(0, 1).direction).toBe('new')
    expect(rankDelta(Number.NaN, 1).direction).toBe('new')
  })

  it('handles tied ranks, which the view emits as repeats', () => {
    // `rank()` gives 1, 1, 3 — moving off a shared first place is still a drop.
    expect(rankDelta(1, 3).moved).toBe(-2)
    expect(rankDelta(3, 1).moved).toBe(2)
  })
})

describe('rank memory', () => {
  beforeEach(clearRankMemory)

  it('keeps ranks apart by room, mode, range and player', () => {
    const week = rankMemoryKey('room', 5, 'week', 'player')
    const all = rankMemoryKey('room', 5, 'all', 'player')
    const sixes = rankMemoryKey('room', 6, 'week', 'player')

    recordRank(week, 2)
    recordRank(all, 4)

    expect(readRank(week)).toBe(2)
    expect(readRank(all)).toBe(4)
    expect(readRank(sixes)).toBeNull()
  })

  it('reads back as null once cleared', () => {
    const key = rankMemoryKey('room', 7, 'week', 'player')
    recordRank(key, 1)
    clearRankMemory()
    expect(readRank(key)).toBeNull()
    expect(readPreviousRank(key)).toBeNull()
  })

  it('has no previous rank the first time a player is seen', () => {
    const key = rankMemoryKey('room', 5, 'week', 'player')
    recordRank(key, 4)
    expect(readPreviousRank(key)).toBeNull()
    expect(rankDelta(readPreviousRank(key), 4).direction).toBe('new')
  })

  it('remembers the rank held before a move', () => {
    const key = rankMemoryKey('room', 5, 'week', 'player')
    recordRank(key, 4)
    recordRank(key, 2)

    expect(readRank(key)).toBe(2)
    expect(readPreviousRank(key)).toBe(4)
    expect(rankDelta(readPreviousRank(key), readRank(key) ?? 0).label).toBe('↑ 2nd')
  })

  it('ignores a repeat, so a board that refetches does not fake a move', () => {
    const key = rankMemoryKey('room', 5, 'week', 'player')
    recordRank(key, 4)
    recordRank(key, 2)
    recordRank(key, 2)
    recordRank(key, 2)

    expect(readPreviousRank(key)).toBe(4)
  })

  it('survives the board and the result sheet recording in either order', () => {
    const key = rankMemoryKey('room', 5, 'week', 'player')
    // Before the solve, whoever loaded the board first.
    recordRank(key, 3)
    // After the solve — the sheet and a realtime refetch both see the new rank.
    recordRank(key, 1)
    recordRank(key, 1)

    const delta = rankDelta(readPreviousRank(key), readRank(key) ?? 0)
    expect(delta.direction).toBe('up')
    expect(delta.moved).toBe(2)
  })
})
