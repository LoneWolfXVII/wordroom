import { describe, expect, it } from 'vitest'
import { points } from './points.js'

describe('points', () => {
  it('scores a solve as 7 minus guesses', () => {
    expect(points(1, true)).toBe(6)
    expect(points(2, true)).toBe(5)
    expect(points(3, true)).toBe(4)
    expect(points(4, true)).toBe(3)
    expect(points(5, true)).toBe(2)
    expect(points(6, true)).toBe(1)
  })

  it('scores a fail as 0 even at six guesses', () => {
    expect(points(6, false)).toBe(0)
    expect(points(1, false)).toBe(0)
  })

  it('never goes negative or rewards impossible counts', () => {
    expect(points(7, true)).toBe(0)
    expect(points(0, true)).toBe(0)
    expect(points(-1, true)).toBe(0)
    expect(points(2.5, true)).toBe(0)
  })
})
