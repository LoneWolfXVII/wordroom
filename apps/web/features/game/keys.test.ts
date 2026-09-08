import { describe, expect, it } from 'vitest'
import { accumulateKeyStates, mergeKeyState, outranks } from './keys'

/**
 * `.mts` on purpose. `apps/web` has no `vitest` dependency and its `test`
 * script is a stub, and neither can be changed from this workstream without
 * editing a package.json three agents share. TypeScript's `**\/*.ts` include
 * does not match `.mts`, so these files run under Vitest without breaking
 * `tsc --noEmit`. See the report: enabling them in CI is a two-line change.
 */

const row = (guess: string, marks: string) => ({
  guess,
  marks: [...marks].map((c) =>
    c === 'c' ? ('correct' as const) : c === 'p' ? ('present' as const) : ('absent' as const),
  ),
})

describe('outranks', () => {
  it('fills an unknown key', () => {
    expect(outranks('absent', undefined)).toBe(true)
  })

  it('promotes present over absent and correct over present', () => {
    expect(outranks('present', 'absent')).toBe(true)
    expect(outranks('correct', 'present')).toBe(true)
  })

  it('never demotes a key', () => {
    expect(outranks('absent', 'present')).toBe(false)
    expect(outranks('present', 'correct')).toBe(false)
    expect(outranks('correct', 'correct')).toBe(false)
  })
})

describe('mergeKeyState', () => {
  it('returns the same object when nothing changes, so React can skip the render', () => {
    const states = { a: 'correct' as const }
    expect(mergeKeyState(states, 'a', 'absent')).toBe(states)
  })

  it('is case-insensitive about the letter', () => {
    expect(mergeKeyState({}, 'A', 'present')).toEqual({ a: 'present' })
  })
})

describe('accumulateKeyStates', () => {
  it('is empty before the first guess', () => {
    expect(accumulateKeyStates([])).toEqual({})
  })

  it('colours every letter of a guess', () => {
    expect(accumulateKeyStates([row('crane', 'aacpa')])).toEqual({
      c: 'absent',
      r: 'absent',
      a: 'correct',
      n: 'present',
      e: 'absent',
    })
  })

  it('keeps the best mark a letter has ever earned', () => {
    // S is green in the first row and grey in the second; the keyboard is a
    // record of what the player knows, not of the last row they played.
    const states = accumulateKeyStates([row('sound', 'cappa'), row('mists', 'aaaaa')])
    expect(states.s).toBe('correct')
  })

  it('promotes a letter that improves in a later row', () => {
    const states = accumulateKeyStates([row('crane', 'aaapa'), row('nicer', 'caaaa')])
    expect(states.n).toBe('correct')
  })

  it('handles a repeated letter inside one guess by taking the better mark', () => {
    // Both Es: the second is green, so the key is green.
    const states = accumulateKeyStates([row('geese', 'aapac')])
    expect(states.e).toBe('correct')
  })
})
