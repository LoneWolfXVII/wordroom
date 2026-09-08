/**
 * Codec for `attempts.marks`.
 *
 * The column is `text[]` with a constraint that its length matches `guesses`,
 * so one array element is one *row* of the colour grid. This file decides how a
 * row is written down.
 *
 * FORMAT: the `Mark` names, comma separated, in guess order.
 *
 *     'correct,present,absent,absent,correct'
 *
 * Compact single letters would be smaller, but this column is read by three
 * other workstreams (the leaderboard grid, the result sheet, the realtime
 * payload) and there is no decoder in `@wordroom/shared` for them to import.
 * A self-describing value cannot be misread. The overhead is ~200 bytes per
 * finished attempt.
 *
 * PROPOSAL TO WORKSTREAM 0: move `encodeMarkRow`/`decodeMarkRow` into
 * `packages/shared` so the app does not have to restate the format. Adding to
 * the contract is cheap; this file is the reference implementation.
 *
 * NOT A SECRET: marks are the spoiler-free projection. They are safe to return
 * to the whole room. The *guesses* are not, and are not stored here.
 */

import type { Mark, MarkRow } from '@wordroom/shared'

const MARKS: readonly Mark[] = ['correct', 'present', 'absent']

function isMark(value: string): value is Mark {
  return (MARKS as readonly string[]).includes(value)
}

export function encodeMarkRow(row: MarkRow): string {
  return row.join(',')
}

export function decodeMarkRow(encoded: string): MarkRow {
  const parts = encoded.split(',')
  const row: Mark[] = []
  for (const part of parts) {
    const value = part.trim()
    if (!isMark(value)) throw new Error(`decodeMarkRow: unknown mark ${JSON.stringify(part)}`)
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
