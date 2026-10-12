import { describe, expect, it } from 'vitest'
import { fourBoardPoints, fourGamePoints, points } from './points.js'

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

describe('Four points', () => {
  it('scores 10 - n per solved board, 0 when unsolved', () => {
    expect(fourBoardPoints(1)).toBe(9)
    expect(fourBoardPoints(9)).toBe(1)
    expect(fourBoardPoints(null)).toBe(0)
    expect(fourBoardPoints(10)).toBe(0)
    expect(fourBoardPoints(0)).toBe(0)
    expect(fourBoardPoints(2.5)).toBe(0)
  })

  it('sums a game, and the best possible is 30', () => {
    expect(fourGamePoints([1, 2, 3, 4])).toBe(30)
    expect(fourGamePoints([4, 6, 8, null])).toBe(6 + 4 + 2)
    expect(fourGamePoints([null, null, null, null])).toBe(0)
  })
})
