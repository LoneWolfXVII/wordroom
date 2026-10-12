import { describe, expect, it } from 'vitest'
import { fourShareText } from './share'

describe('fourShareText', () => {
  it('shows each board as the guess that solved it, red for unsolved', () => {
    expect(
      fourShareText({
        number: 12,
        solvedAt: [4, 6, 8, null],
        points: 12,
        roomCode: 'abcd',
        host: 'wordroom.test',
      }),
    ).toBe('Wordroom Four No. 12 · 12 pts\n4️⃣6️⃣\n8️⃣🟥\nwordroom.test/r/ABCD')
  })

  it('says 1 pt, not 1 pts', () => {
    expect(
      fourShareText({
        number: 1,
        solvedAt: [9, null, null, null],
        points: 1,
        roomCode: 'ABCD',
        host: 'h',
      }),
    ).toMatch(/· 1 pt\n/)
  })

  it('never names the game it is not', () => {
    const text = fourShareText({
      number: 1,
      solvedAt: [1, 2, 3, 4],
      points: 30,
      roomCode: 'ABCD',
      host: 'h',
    })
    expect(text).not.toMatch(/wordle/i)
  })
})
