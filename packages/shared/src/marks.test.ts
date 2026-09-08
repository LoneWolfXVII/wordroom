import { describe, expect, it } from 'vitest'
import { decodeMarkRow, decodeMarks, encodeMarkRow, encodeMarks } from './marks.js'
import { scoreGuess } from './score.js'

describe('mark codec', () => {
  it('round-trips a scored row', () => {
    const row = scoreGuess('bobby', 'abbey')
    expect(decodeMarkRow(encodeMarkRow(row))).toEqual(row)
  })

  it('writes the self-describing format', () => {
    expect(encodeMarkRow(scoreGuess('crane', 'crane'))).toBe(
      'correct,correct,correct,correct,correct',
    )
  })

  it('round-trips a whole grid', () => {
    const rows = [scoreGuess('crane', 'swing'), scoreGuess('swing', 'swing')]
    expect(decodeMarks(encodeMarks(rows))).toEqual(rows)
  })

  it('tolerates surrounding whitespace', () => {
    expect(decodeMarkRow('correct, present ,absent')).toEqual(['correct', 'present', 'absent'])
  })

  it('refuses a value it did not write', () => {
    expect(() => decodeMarkRow('correct,green')).toThrow(/unknown mark/)
    expect(() => decodeMarkRow('ccccc')).toThrow(/unknown mark/)
    expect(() => decodeMarkRow('')).toThrow(/unknown mark/)
  })
})
