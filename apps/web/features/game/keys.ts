import type { Mark, ScoredGuess } from '@wordroom/shared'

/** The three keyboard rows, as in the prototype. */
export const KEYBOARD_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'] as const

/** A key press: a letter, or one of the two action keys. */
export type KeyValue = string

export const ENTER_KEY = 'enter'
export const BACKSPACE_KEY = 'back'

export type KeyStates = Readonly<Record<string, Mark>>

/**
 * A key only ever gets *better*. Once a letter has shown green it stays green
 * even if a later guess puts it somewhere it does not belong, because the
 * keyboard is a summary of what the player knows, not of the last row.
 */
const RANK: Record<Mark, number> = { absent: 1, present: 2, correct: 3 }

/** True when `next` should replace `current` on a key. */
export function outranks(next: Mark, current: Mark | undefined): boolean {
  if (current === undefined) return true
  return RANK[next] > RANK[current]
}

/** Merge one letter's mark into a key-state map, returning a new map. */
export function mergeKeyState(states: KeyStates, letter: string, mark: Mark): KeyStates {
  const key = letter.toLowerCase()
  if (!outranks(mark, states[key])) return states
  return { ...states, [key]: mark }
}

/**
 * Collapse every scored guess into one colour per key. Used when the board is
 * rebuilt from an attempt that is already in progress — a reload, or the result
 * sheet reopening — where there is no reveal animation to colour keys as it goes.
 */
export function accumulateKeyStates(rows: readonly ScoredGuess[]): KeyStates {
  let states: KeyStates = {}
  for (const row of rows) {
    const word = row.guess.toLowerCase()
    for (let i = 0; i < row.marks.length; i++) {
      const letter = word[i]
      const mark = row.marks[i]
      if (letter === undefined || mark === undefined) continue
      states = mergeKeyState(states, letter, mark)
    }
  }
  return states
}
