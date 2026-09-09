import {
  DEFAULT_PLAYER_SETTINGS,
  isHardModeValid,
  MAX_GUESSES,
  type Mode,
  type PlayerSettings,
  type Puzzle,
  type ScoredGuess,
  type TimerMode,
} from '@wordroom/shared'
import { create } from 'zustand'
import { type GameApi, GameApiError, type GuessResult, getGameApi } from './api'
import { isKnownWord, preloadGuessList } from './guess-list'
import { accumulateKeyStates, type KeyStates, mergeKeyState } from './keys'
import { prefersReducedMotion, STRUCT_MS, wait } from './motion'
import { clearPrefetched, prefetchPuzzle, takePrefetched } from './prefetch'

/**
 * The game store.
 *
 * Everything here is synchronous state plus four async actions that talk to the
 * Edge Functions. Deliberately no timers: the reveal choreography, the clock
 * tick and the result-sheet delay all live in hooks, so every transition below
 * can be driven straight from a test.
 *
 * SECURITY: `revealedWord` is the only field that can hold the puzzle's word,
 * and it is only ever filled from a `submit-guess` response that came back with
 * `finished: true` — solved, out of guesses, or timed out. Nothing sets it while
 * the attempt is live, because the server does not send it while the attempt is
 * live.
 */

export type GameStatus =
  /** No puzzle yet. */
  | 'idle'
  /** Fetching a puzzle. */
  | 'loading'
  /** Accepting input. */
  | 'playing'
  /** A row is flipping; input is blocked until it lands. */
  | 'revealing'
  | 'solved'
  | 'failed'

/** Where the board is in a next-puzzle swap. */
export type BoardPhase = 'idle' | 'out' | 'in'

/** An unfinished attempt, as the server still has it. */
export interface RestoredAttempt {
  attemptId: string
  guesses: ScoredGuess[]
}

export interface RoomContext {
  id: string
  name: string
  code: string
}

/** A one-line message for the toast, with a token so a repeat still fires. */
export interface Notice {
  token: number
  message: string
}

export interface GameState {
  room: RoomContext | null
  puzzle: Puzzle | null
  mode: Mode
  /** The puzzle number to play next in each mode. Each mode has its own sequence. */
  numbers: Record<Mode, number>

  /**
   * Settings as they applied when this puzzle started. Snapshotted because the
   * server snapshots them too: changing a setting mid-puzzle must not change the
   * rules of a puzzle already in play.
   */
  hardMode: boolean
  timerMode: TimerMode
  perPuzzleSeconds: number
  /** Settings to apply from the next puzzle. */
  pendingSettings: PlayerSettings

  guesses: ScoredGuess[]
  /** Letters typed into the active row and not yet submitted. */
  current: string
  status: GameStatus
  keyStates: KeyStates

  /** Index of the row currently flipping, or null. */
  revealingRow: number | null
  /** Index of the solved row, once it is time to bounce it. */
  bounceRow: number | null
  /** Bumped every time the active row should shake. */
  shakeToken: number
  boardPhase: BoardPhase

  attemptId: string | null
  /** The word. Non-null only after the attempt is solved, failed or timed out. */
  revealedWord: string | null
  points: number | null
  resultOpen: boolean

  startedAt: number | null
  guessStartedAt: number | null
  /** Elapsed time frozen at the moment the attempt finished. */
  frozenMs: number | null

  submitting: boolean
  notice: Notice | null
  /** Held between the server's answer and the end of the flip animation. */
  pendingResult: GuessResult | null
}

export interface GameActions {
  /** Point the store at a room and a starting puzzle number per mode. */
  configure(input: {
    room: RoomContext
    mode?: Mode
    numbers?: Partial<Record<Mode, number>>
    settings?: PlayerSettings
    api?: GameApi
  }): void
  /**
   * Open a puzzle. `restore` re-hydrates an attempt already in progress, so a
   * reload comes back to the board the server still holds rather than an empty
   * one whose rows no longer line up with it.
   */
  loadPuzzle(mode: Mode, number: number, restore?: RestoredAttempt): Promise<void>
  typeLetter(letter: string): void
  deleteLetter(): void
  submit(): Promise<void>
  /** The countdown reached zero. Finishes the attempt as a fail, server-side. */
  timeout(): Promise<void>
  /** The flip has landed: apply the outcome the server already told us about. */
  finishReveal(): void
  /** Colour one keyboard key mid-flip, as the prototype does. */
  colourKey(letter: string, index: number): void
  openResult(): void
  closeResult(): void
  nextPuzzle(): Promise<void>
  setMode(mode: Mode): Promise<void>
  /** Store settings to apply from the next puzzle. Never mid-puzzle. */
  applySettings(settings: PlayerSettings): void
  notify(message: string): void
  reset(): void
}

export type GameStore = GameState & GameActions

const initialState: GameState = {
  room: null,
  puzzle: null,
  mode: 5,
  numbers: { 5: 1, 6: 1, 7: 1 },
  hardMode: DEFAULT_PLAYER_SETTINGS.hardMode,
  timerMode: DEFAULT_PLAYER_SETTINGS.timerMode,
  perPuzzleSeconds: DEFAULT_PLAYER_SETTINGS.perPuzzleSeconds,
  pendingSettings: DEFAULT_PLAYER_SETTINGS,
  guesses: [],
  current: '',
  status: 'idle',
  keyStates: {},
  revealingRow: null,
  bounceRow: null,
  shakeToken: 0,
  boardPhase: 'idle',
  attemptId: null,
  revealedWord: null,
  points: null,
  resultOpen: false,
  startedAt: null,
  guessStartedAt: null,
  frozenMs: null,
  submitting: false,
  notice: null,
  pendingResult: null,
}

/** Play state only — everything a new puzzle wipes. Context and settings survive. */
function freshPuzzleState(now: number, settings: PlayerSettings) {
  return {
    guesses: [],
    current: '',
    keyStates: {},
    revealingRow: null,
    bounceRow: null,
    boardPhase: 'idle' as BoardPhase,
    attemptId: null,
    revealedWord: null,
    points: null,
    resultOpen: false,
    startedAt: now,
    guessStartedAt: now,
    frozenMs: null,
    submitting: false,
    pendingResult: null,
    hardMode: settings.hardMode,
    timerMode: settings.timerMode,
    perPuzzleSeconds: settings.perPuzzleSeconds,
  }
}

export const useGameStore = create<GameStore>()((set, get) => {
  /** The transport, overridable per store for tests and the dev harness. */
  let api: GameApi | null = null
  const transport = (): GameApi => api ?? getGameApi()

  /**
   * Start fetching the puzzle after this one.
   *
   * Called the instant an attempt ends, which is the start of the several
   * seconds a player spends on the result sheet. By the time they tap "Next
   * puzzle" the answer is usually already here, so the tap costs a promise
   * resolution rather than a round trip — the difference between roughly half a
   * second on a phone and nothing at all.
   *
   * Only ever the immediate next puzzle in the mode being played: a player who
   * stops here should not have caused a row to be written for a puzzle nobody
   * reached.
   */
  const queueNextPuzzle = (read: () => GameStore): void => {
    const { room, puzzle, mode } = read()
    if (room === null || puzzle === null) return
    prefetchPuzzle(transport(), { roomId: room.id, mode, number: puzzle.number + 1 })
  }

  /** Monotonic, so the same message twice in a row still shows twice. */
  let noticeToken = 0

  function shake(message: string): void {
    noticeToken += 1
    set((state) => ({
      shakeToken: state.shakeToken + 1,
      notice: { token: noticeToken, message },
    }))
  }

  return {
    ...initialState,

    configure({ room, mode, numbers, settings, api: injected }) {
      if (injected !== undefined) api = injected
      // Another room's prefetches are not this room's. The keys carry the room
      // id so a stale entry can never be served, but there is no reason to keep
      // paying to hold them.
      clearPrefetched()
      set((state) => {
        // Pointing the store at a different room must not leave the previous
        // room's puzzle, board and key colours on screen. The store is module
        // scoped, so without this a player who leaves one room and opens another
        // sees the old game until the new puzzle lands — and briefly types into
        // a board belonging to a room they are no longer in.
        const switchingRooms = state.room !== null && state.room.id !== room.id
        const carried = switchingRooms ? initialState : state

        return {
          ...carried,
          room,
          mode: mode ?? carried.mode,
          numbers: switchingRooms
            ? { ...initialState.numbers, ...numbers }
            : { ...state.numbers, ...numbers },
          pendingSettings: settings ?? carried.pendingSettings,
        }
      })
    },

    async loadPuzzle(mode, number, restore) {
      const room = get().room
      if (room === null) return

      set({ status: 'loading', mode })
      preloadGuessList(mode)

      try {
        // A prefetch started when the last attempt ended is usually settled by
        // now, which is the whole point: the tap costs nothing the player waits
        // for. Falling back to a fresh call keeps this the only place that
        // decides how a puzzle is loaded.
        const request = { roomId: room.id, mode, number }
        const puzzle = await (takePrefetched(request) ?? transport().getPuzzle(request))
        set((state) => {
          const fresh = freshPuzzleState(Date.now(), state.pendingSettings)
          // A restored attempt only replaces the empty board; everything else a
          // new puzzle wipes still gets wiped. Guesses beyond the limit are
          // ignored rather than trusted, so a bad row cannot overflow the board.
          const rows = restore ? restore.guesses.slice(0, MAX_GUESSES) : []

          return {
            puzzle,
            mode: puzzle.mode,
            numbers: { ...state.numbers, [puzzle.mode]: puzzle.number },
            status: 'playing' as GameStatus,
            ...fresh,
            ...(restore
              ? {
                  guesses: rows,
                  keyStates: accumulateKeyStates(rows),
                  attemptId: restore.attemptId,
                }
              : {}),
          }
        })
      } catch (error) {
        set({ status: 'idle' })
        get().notify(messageFor(error))
      }
    },

    typeLetter(letter) {
      const { status, current, puzzle } = get()
      if (status !== 'playing' || puzzle === null) return
      if (!/^[a-z]$/.test(letter)) return
      if (current.length >= puzzle.mode) return
      set({ current: current + letter })
    },

    deleteLetter() {
      const { status, current } = get()
      if (status !== 'playing' || current.length === 0) return
      set({ current: current.slice(0, -1) })
    },

    async submit() {
      const state = get()
      const { puzzle, current, status } = state
      if (puzzle === null || status !== 'playing' || state.submitting) return

      if (current.length < puzzle.mode) {
        shake('Not enough letters')
        return
      }

      // The client list is a courtesy check: it makes the shake instant and
      // saves a round trip. `undefined` means the list has not loaded yet, in
      // which case the server — which is the authority either way — decides.
      if (isKnownWord(current, puzzle.mode) === false) {
        shake('Not a word')
        return
      }

      if (state.hardMode) {
        const verdict = isHardModeValid(current, state.guesses)
        if (!verdict.valid) {
          shake(verdict.message)
          return
        }
      }

      set({ submitting: true })

      try {
        const result = await submitWithRetry(transport(), {
          puzzleId: puzzle.id,
          guess: current,
          ...(state.timerMode === 'off' ? {} : { elapsedMs: Date.now() - (state.startedAt ?? 0) }),
        })

        if (result.marks === null) {
          throw new GameApiError('internal', 'The server scored nothing for that guess.')
        }

        set((prev) => ({
          guesses: [...prev.guesses, { guess: current, marks: result.marks ?? [] }],
          current: '',
          status: 'revealing',
          revealingRow: prev.guesses.length,
          attemptId: result.attemptId,
          submitting: false,
          pendingResult: result,
        }))
      } catch (error) {
        set({ submitting: false })
        // An invalid word is not a guess: the row is not consumed, so the
        // letters stay on the board and the row shakes.
        if (error instanceof GameApiError && isRejection(error.code)) {
          shake(error.message)
          return
        }
        get().notify(messageFor(error))
      }
    },

    async timeout() {
      const state = get()
      const { puzzle } = state
      if (puzzle === null) return
      if (state.status !== 'playing' && state.status !== 'revealing') return
      if (state.submitting) return

      const elapsed = Date.now() - (state.startedAt ?? Date.now())
      set({ submitting: true, status: 'revealing', frozenMs: elapsed })

      try {
        const result = await transport().submitTimeout({
          puzzleId: puzzle.id,
          elapsedMs: elapsed,
        })
        set({ submitting: false, pendingResult: result, attemptId: result.attemptId })
        get().finishReveal()
        get().notify('Out of time')
      } catch (error) {
        set({ submitting: false, status: 'playing', frozenMs: null })
        get().notify(messageFor(error))
      }
    },

    finishReveal() {
      const state = get()
      const result = state.pendingResult
      set({ revealingRow: null, keyStates: accumulateKeyStates(state.guesses) })
      if (result === null) {
        set({ status: 'playing' })
        return
      }

      const elapsed = state.frozenMs ?? Date.now() - (state.startedAt ?? Date.now())

      if (result.solved) {
        queueNextPuzzle(get)
        set({
          status: 'solved',
          bounceRow: state.guesses.length - 1,
          revealedWord: result.word,
          points: result.points,
          frozenMs: result.elapsedMs ?? elapsed,
          pendingResult: null,
        })
        return
      }

      if (result.finished) {
        queueNextPuzzle(get)
        set({
          status: 'failed',
          revealedWord: result.word,
          points: result.points ?? 0,
          frozenMs: result.elapsedMs ?? elapsed,
          pendingResult: null,
        })
        return
      }

      // Still playing: a per-guess countdown restarts with the new row.
      set({ status: 'playing', guessStartedAt: Date.now(), pendingResult: null })
    },

    colourKey(letter, index) {
      const state = get()
      const row = state.guesses[state.guesses.length - 1]
      const mark = row?.marks[index]
      if (mark === undefined) return
      set({ keyStates: mergeKeyState(state.keyStates, letter, mark) })
    },

    openResult() {
      if (get().status === 'solved' || get().status === 'failed') set({ resultOpen: true })
    },

    closeResult() {
      set({ resultOpen: false })
    },

    async nextPuzzle() {
      const state = get()
      if (state.puzzle === null) return
      await swapBoard(set, get().loadPuzzle(state.mode, state.puzzle.number + 1))
    },

    async setMode(mode) {
      const state = get()
      if (mode === state.mode) return
      await swapBoard(set, get().loadPuzzle(mode, state.numbers[mode]))
    },

    applySettings(settings) {
      set({ pendingSettings: settings })
    },

    notify(message) {
      noticeToken += 1
      set({ notice: { token: noticeToken, message } })
    },

    reset() {
      set({ ...initialState })
    },
  }
})

/**
 * Slide the finished board out, load, slide the new one in.
 *
 * The wait is a floor, not a delay: without it a cached or very fast response
 * would cut the outgoing board off mid-slide and the swap would read as a
 * flicker. With motion reduced there is no slide to protect, so there is no wait.
 */
async function swapBoard(
  set: (partial: Partial<GameStore>) => void,
  loading: Promise<void>,
): Promise<void> {
  set({ resultOpen: false, boardPhase: 'out' })
  await Promise.all([loading, wait(prefersReducedMotion() ? 0 : STRUCT_MS)])
  set({ boardPhase: 'in' })
}

/** Codes that mean "that was not a guess" — the row is not consumed. */
function isRejection(code: string): boolean {
  return code === 'not_a_word' || code === 'wrong_length' || code === 'hard_mode_violation'
}

/**
 * `guess_in_flight` means another request for the same attempt won the race —
 * a double tap, or a retried request. The server tells us to retry, so retry
 * once rather than surfacing a 409 the player cannot act on.
 */
async function submitWithRetry(
  api: GameApi,
  input: { puzzleId: string; guess: string; elapsedMs?: number },
): Promise<GuessResult> {
  try {
    return await api.submitGuess(input)
  } catch (error) {
    if (error instanceof GameApiError && error.code === 'guess_in_flight') {
      return await api.submitGuess(input)
    }
    throw error
  }
}

function messageFor(error: unknown): string {
  if (error instanceof GameApiError) return error.message
  return 'Something went wrong. Try again.'
}

/** Rows still to draw under the guesses that exist. */
export function emptyRowCount(guessCount: number): number {
  return Math.max(0, MAX_GUESSES - guessCount)
}
