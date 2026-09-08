import type { MarkRow } from './types.js'

export interface ScoredGuess {
  guess: string
  marks: MarkRow
}

export type HardModeResult =
  | { valid: true }
  /** `reason` is for tests and telemetry; `message` is what the toast shows. */
  | { valid: false; reason: 'position' | 'missing'; message: string }

export interface HardModeConstraints {
  /** Position index -> the letter that must sit there (revealed green). */
  fixed: Map<number, string>
  /** Letter -> how many copies the guess must contain (greens + yellows). */
  minCount: Map<string, number>
}

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th']

function ordinal(n: number): string {
  return ORDINALS[n - 1] ?? `${n}th`
}

/**
 * Collapse every previous scored guess into the hints hard mode forces you to
 * keep. The required count for a letter is the *most* that any single previous
 * row revealed, not the sum across rows — two rows each showing one yellow E
 * prove there is one E, not two.
 */
export function hardModeConstraints(previous: readonly ScoredGuess[]): HardModeConstraints {
  const fixed = new Map<number, string>()
  const minCount = new Map<string, number>()

  for (const row of previous) {
    const word = row.guess.toLowerCase()
    const perRow = new Map<string, number>()

    for (let i = 0; i < row.marks.length; i++) {
      const letter = word[i]
      if (letter === undefined) continue
      const mark = row.marks[i]
      if (mark === 'correct') {
        fixed.set(i, letter)
      }
      if (mark === 'correct' || mark === 'present') {
        perRow.set(letter, (perRow.get(letter) ?? 0) + 1)
      }
    }

    for (const [letter, count] of perRow) {
      minCount.set(letter, Math.max(minCount.get(letter) ?? 0, count))
    }
  }

  return { fixed, minCount }
}

/**
 * Hard mode: a guess may not drop a revealed green or omit a revealed yellow.
 * Letters already shown to be absent stay legal — hard mode constrains what you
 * must keep, not what you may try.
 *
 * Rejections carry a specific message so the toast can say what is wrong.
 */
export function isHardModeValid(guess: string, previous: readonly ScoredGuess[]): HardModeResult {
  const g = guess.toLowerCase()
  const { fixed, minCount } = hardModeConstraints(previous)

  // Greens first, left to right, so the message points at the earliest slip.
  for (const [index, letter] of [...fixed].sort((a, b) => a[0] - b[0])) {
    if (g[index] !== letter) {
      return {
        valid: false,
        reason: 'position',
        message: `${ordinal(index + 1)} letter must be ${letter.toUpperCase()}`,
      }
    }
  }

  for (const [letter, required] of minCount) {
    let have = 0
    for (const ch of g) {
      if (ch === letter) have++
    }
    if (have < required) {
      const upper = letter.toUpperCase()
      return {
        valid: false,
        reason: 'missing',
        message:
          required > 1 ? `Guess must contain ${required} ${upper}s` : `Guess must contain ${upper}`,
      }
    }
  }

  return { valid: true }
}
