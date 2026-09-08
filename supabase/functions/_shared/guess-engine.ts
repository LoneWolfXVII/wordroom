/**
 * The decision core of `submit-guess`, with no I/O in it.
 *
 * Every rule that decides what a player is told lives here so it can be tested
 * exhaustively without a database — including the rule that matters most: the
 * answer is part of the result only once the attempt has finished.
 *
 * Scoring and hard mode are NOT implemented here. They come from
 * `@wordroom/shared`, which both the app and this function import, so there is
 * exactly one definition of each.
 */

import {
  isHardModeValid,
  isSolved,
  type MarkRow,
  MAX_GUESSES,
  type Mode,
  points,
  type ScoredGuess,
  scoreGuess,
} from '@wordroom/shared'
import type { ErrorDetails } from './errors.ts'

/** The parts of an attempt the rules care about. */
export interface AttemptState {
  guesses: string[]
  marks: MarkRow[]
  solved: boolean
  /** ISO timestamp once the attempt is over; null while it is in play. */
  finishedAt: string | null
  /** Snapshotted from the player's settings when the attempt was opened. */
  hardMode: boolean
}

export const emptyAttemptState = (hardMode: boolean): AttemptState => ({
  guesses: [],
  marks: [],
  solved: false,
  finishedAt: null,
  hardMode,
})

export type RejectionCode =
  | 'wrong_length'
  | 'not_a_word'
  | 'hard_mode_violation'
  | 'attempt_finished'

export interface GuessRejected {
  kind: 'rejected'
  code: RejectionCode
  message: string
  details: ErrorDetails | undefined
}

export interface GuessAccepted {
  kind: 'accepted'
  marks: MarkRow
  next: AttemptState
  solved: boolean
  finished: boolean
  points: number
}

export type GuessOutcome = GuessRejected | GuessAccepted

const reject = (code: RejectionCode, message: string, details?: ErrorDetails): GuessRejected => ({
  kind: 'rejected',
  code,
  message,
  details,
})

export interface PlayGuessInput {
  answer: string
  mode: Mode
  guess: string
  state: AttemptState
  /**
   * Whether the guess is in the dictionary, decided by `guess_bank` in the same
   * query that fetched the puzzle. `undefined` means nobody asked — the engine
   * then trusts the caller, which is only correct where the word has already
   * been checked, so every call site passes it.
   */
  isRealWord?: boolean
  /** ISO timestamp to stamp on the attempt if this guess ends it. */
  now: string
}

export function normaliseGuess(raw: string): string {
  return raw.trim().toLowerCase()
}

/**
 * Apply one guess.
 *
 * A rejected guess leaves `state` untouched — that is the "an invalid word is
 * not a guess" rule from CLAUDE.md, and it is why this returns the next state
 * rather than mutating anything. The row is only consumed on acceptance.
 */
export function playGuess(input: PlayGuessInput): GuessOutcome {
  const { answer, mode, state, now } = input
  const guess = normaliseGuess(input.guess)

  if (state.finishedAt !== null || state.solved || state.guesses.length >= MAX_GUESSES) {
    return reject('attempt_finished', 'This puzzle is already over.')
  }

  if (guess.length !== mode || !/^[a-z]+$/.test(guess)) {
    return reject('wrong_length', `Enter a ${mode}-letter word.`, { mode })
  }

  // The dictionary lookup happens in Postgres, alongside the reads this request
  // already makes — see `guess_bank`. Compiling 47,000 words into the function
  // instead cost every cold start about 344KB it usually did not need.
  if (input.isRealWord === false) {
    return reject('not_a_word', 'Not in word list.')
  }

  if (state.hardMode) {
    const previous: ScoredGuess[] = state.guesses.map((word, index) => ({
      guess: word,
      marks: state.marks[index] ?? [],
    }))
    const verdict = isHardModeValid(guess, previous)
    if (!verdict.valid) {
      // The message only ever names letters this player has already revealed to
      // themselves, so it tells them nothing new about the answer.
      return reject('hard_mode_violation', verdict.message, { reason: verdict.reason })
    }
  }

  const marks = scoreGuess(guess, answer)
  const solved = isSolved(marks)
  const guesses = [...state.guesses, guess]
  const finished = solved || guesses.length >= MAX_GUESSES

  return {
    kind: 'accepted',
    marks,
    solved,
    finished,
    points: points(guesses.length, solved),
    next: {
      guesses,
      marks: [...state.marks, marks],
      solved,
      finishedAt: finished ? now : null,
      hardMode: state.hardMode,
    },
  }
}

/**
 * End an attempt because the player's timer ran out. A timeout is a fail, so it
 * scores zero — and, like any other finish, it unlocks the answer.
 */
export function timeOut(state: AttemptState, now: string): AttemptState {
  if (state.finishedAt !== null) return state
  return { ...state, solved: false, finishedAt: now }
}

export const guessesRemaining = (state: AttemptState): number =>
  Math.max(MAX_GUESSES - state.guesses.length, 0)
