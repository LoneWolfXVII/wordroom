import { describe, expect, it } from 'vitest'
import { isHeld, listNames, type WaitStatus } from './status'

const status = (over: Partial<WaitStatus>): WaitStatus => ({
  pace: 'wait',
  isHost: false,
  round: 3,
  waitingFor: [],
  ...over,
})

describe('isHeld', () => {
  it('holds only what lies past the open round, in Wait mode', () => {
    expect(isHeld(status({}), 4)).toBe(true)
    expect(isHeld(status({}), 3)).toBe(false)
    expect(isHeld(status({}), 2)).toBe(false)
    expect(isHeld(status({ round: null }), 9)).toBe(false)
    expect(isHeld(status({ pace: 'speedrun' }), 9)).toBe(false)
    expect(isHeld(null, 9)).toBe(false)
  })
})

describe('listNames', () => {
  it('reads as a sentence', () => {
    expect(listNames(['Priya'])).toBe('Priya')
    expect(listNames(['Priya', 'Sam'])).toBe('Priya and Sam')
    expect(listNames(['Priya', 'Sam', 'Jo'])).toBe('Priya, Sam and Jo')
  })
})
