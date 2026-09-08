import { isSolved, MAX_GUESSES, type Mode, type Puzzle, points, scoreGuess } from '@wordroom/shared'
import { type GameApi, GameApiError, type GuessResult } from '../api'
import { loadGuessList } from '../guess-list'

/**
 * A local stand-in for the Edge Functions, for `/dev/game` and for tests.
 *
 * NOT a second implementation of the game. It exists so the board, the
 * keyboard and the result sheet can be driven without a Supabase project, and
 * it is wired up by exactly one route.
 *
 * On the security rule: these words are a fixture, lifted from the prototype's
 * demo list. They are not a room's puzzle and there is no room — nothing here
 * can reveal a real answer, because there is no real answer in the process. In
 * production `getPuzzle` returns a `Puzzle`, which has no field to put a word
 * in, and the word arrives only with a finished `submit-guess`. This double
 * behaves the same way, so a bug that made the app read a word early would fail
 * here too rather than being papered over.
 */

const FIXTURES: Record<Mode, readonly string[]> = {
  5: ['cream', 'piece', 'cloud', 'board', 'chest', 'charm', 'south', 'trial', 'power', 'final'],
  6: ['colony', 'battle', 'defeat', 'advise', 'motive', 'dinner', 'tablet', 'poetry', 'double'],
  7: ['mineral', 'involve', 'thirsty', 'eternal', 'confirm', 'student', 'freedom', 'massage'],
}

/** Enough delay to see the in-flight states without making the harness tedious. */
const LATENCY_MS = 120

interface Attempt {
  word: string
  guesses: string[]
  solved: boolean
  finished: boolean
  elapsedMs: number | null
}

export interface MockApiOptions {
  hardMode?: boolean
  latencyMs?: number
}

export function createMockGameApi(options: MockApiOptions = {}): GameApi {
  const latency = options.latencyMs ?? LATENCY_MS
  const attempts = new Map<string, Attempt>()

  const sleep = () => new Promise((resolve) => setTimeout(resolve, latency))

  function attemptFor(puzzleId: string): Attempt {
    const attempt = attempts.get(puzzleId)
    if (attempt === undefined) {
      throw new GameApiError('puzzle_not_found', 'That puzzle is gone.', 404)
    }
    return attempt
  }

  function result(puzzleId: string, attempt: Attempt, marks: GuessResult['marks']): GuessResult {
    return {
      attemptId: `attempt-${puzzleId}`,
      puzzleId,
      marks,
      guessCount: attempt.guesses.length,
      guessesRemaining: MAX_GUESSES - attempt.guesses.length,
      solved: attempt.solved,
      finished: attempt.finished,
      // The word is released on exactly the same condition the server uses.
      word: attempt.finished ? attempt.word : null,
      points: attempt.finished ? points(attempt.guesses.length, attempt.solved) : null,
      elapsedMs: attempt.elapsedMs,
    }
  }

  return {
    async getPuzzle({ roomId, mode, number }): Promise<Puzzle> {
      await sleep()
      const words = FIXTURES[mode]
      const word = words[(number - 1) % words.length]
      if (word === undefined) {
        throw new GameApiError('internal', 'The harness has no word for that mode.')
      }

      const id = `${roomId}-${mode}-${number}`
      if (!attempts.has(id)) {
        attempts.set(id, { word, guesses: [], solved: false, finished: false, elapsedMs: null })
      }
      // Warm the list so the harness rejects typos the way the app does.
      void loadGuessList(mode)
      return { id, roomId, mode, number }
    },

    async submitGuess({ puzzleId, guess, elapsedMs }): Promise<GuessResult> {
      await sleep()
      const attempt = attemptFor(puzzleId)

      if (attempt.finished) {
        throw new GameApiError('attempt_finished', 'That puzzle is already over.', 409)
      }
      if (guess.length !== attempt.word.length) {
        throw new GameApiError('wrong_length', 'Not enough letters', 422)
      }

      const words = await loadGuessList(attempt.word.length as Mode)
      if (!words.has(guess.toLowerCase())) {
        throw new GameApiError('not_a_word', 'Not a word', 422)
      }

      const marks = scoreGuess(guess, attempt.word)
      attempt.guesses.push(guess)
      attempt.solved = isSolved(marks)
      attempt.finished = attempt.solved || attempt.guesses.length >= MAX_GUESSES
      if (attempt.finished) attempt.elapsedMs = elapsedMs ?? null

      return result(puzzleId, attempt, marks)
    },

    async submitTimeout({ puzzleId, elapsedMs }): Promise<GuessResult> {
      await sleep()
      const attempt = attemptFor(puzzleId)
      if (!attempt.finished) {
        attempt.finished = true
        attempt.solved = false
        attempt.elapsedMs = elapsedMs ?? null
      }
      return result(puzzleId, attempt, null)
    },
  }
}
