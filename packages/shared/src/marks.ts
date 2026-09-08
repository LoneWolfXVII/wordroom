import type { Mark, MarkRow } from './types.js'

/**
 * Codec for `attempts.marks`.
 *
 * The column is `text[]` and its length is constrained to match `guesses`, so
 * one array element is one *row* of the colour grid. The format is the `Mark`
 * names, comma separated, in guess order:
 *
 *     'correct,present,absent,absent,correct'
 *
 * Single letters would be smaller, but this column is read by the leaderboard
 * grid, the result sheet and the realtime payload. A self-describing value
 * cannot be misread, and ~200 bytes per finished attempt is not worth saving.
 *
 * Marks are the spoiler-free projection of an attempt and are safe to show the
 * whole room. The guesses are not, and are not stored here.
 */

const MARKS: readonly Mark[] = ['correct', 'present', 'absent']

function isMark(value: string): value is Mark {
  return (MARKS as readonly string[]).includes(value)
}

export function encodeMarkRow(row: MarkRow): string {
  return row.join(',')
}

/** @throws if the value is not a row this codec wrote. */
export function decodeMarkRow(encoded: string): MarkRow {
  const row: Mark[] = []
  for (const part of encoded.split(',')) {
    const value = part.trim()
    if (!isMark(value)) {
      throw new Error(`decodeMarkRow: unknown mark ${JSON.stringify(part)}`)
    }
    row.push(value)
  }
  return row
}

export function encodeMarks(rows: readonly MarkRow[]): string[] {
  return rows.map(encodeMarkRow)
}

export function decodeMarks(encoded: readonly string[]): MarkRow[] {
  return encoded.map(decodeMarkRow)
}
