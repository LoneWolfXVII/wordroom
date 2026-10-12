'use client'

import { FOUR, FOUR_BOARDS, type Mark, wordLength } from '@wordroom/shared'
import { create } from 'zustand'
import { type FourGame, type GameApi, GameApiError } from '@/features/game/api'
import { accumulateKeyStates } from '@/features/game/keys'

/**
 * Four at once: four 5-letter boards, nine guesses, one row typed for all of
 * them.
 *
 * Deliberately its own store rather than a mode of the single-board one. The
 * two share nothing that matters — no hard mode, no timers, no flip sequencing,
 * a shared guess list instead of a per-puzzle one — and the single-board store
 * is already the most intricate file in the game. The server is the source of
 * truth: every guess returns the whole game, and the store just holds it.
 */

const LENGTH = wordLength(FOUR)

export type FourStatus = 'idle' | 'loading' | 'playing' | 'won' | 'over' | 'error'

export interface FourState {
  roomId: string | null
  number: number
  game: FourGame | null
  /** Letters typed into the active row and not yet submitted. */
  current: string
  status: FourStatus
  submitting: boolean
  /** Bumped every time the active row should shake. */
  shakeToken: number
  notice: { token: number; message: string } | null
  startedAt: number | null
}

export interface FourActions {
  configure(input: { roomId: string; api: GameApi }): void
  load(number: number): Promise<void>
  typeLetter(letter: string): void
  deleteLetter(): void
  submit(): Promise<void>
  next(): Promise<void>
  reset(): void
}

export type FourStore = FourState & FourActions

const initialState: FourState = {
  roomId: null,
  number: 1,
  game: null,
  current: '',
  status: 'idle',
  submitting: false,
  shakeToken: 0,
  notice: null,
  startedAt: null,
}

function statusOf(game: FourGame): FourStatus {
  if (!game.finished) return 'playing'
  return game.boards.every((board) => board.solved) ? 'won' : 'over'
}

/** Codes that mean "that was not a guess": the row is not consumed. */
function isRejection(code: string): boolean {
  return code === 'not_a_word' || code === 'wrong_length'
}

export const useFourStore = create<FourStore>()((set, get) => {
  let api: GameApi | null = null
  let noticeToken = 0

  function notify(message: string, shake = false): void {
    noticeToken += 1
    set((state) => ({
      notice: { token: noticeToken, message },
      shakeToken: shake ? state.shakeToken + 1 : state.shakeToken,
    }))
  }

  function messageFor(error: unknown): string {
    return error instanceof GameApiError ? error.message : 'Something went wrong. Try again.'
  }

  return {
    ...initialState,

    configure({ roomId, api: injected }) {
      api = injected
      if (get().roomId !== roomId) set({ ...initialState, roomId })
    },

    async load(number) {
      const { roomId } = get()
      if (api === null || roomId === null) return
      set({ status: 'loading', number, current: '' })
      try {
        const game = await api.getFour({ roomId, number })
        set({
          game,
          number: game.number,
          status: statusOf(game),
          startedAt: game.finished ? null : Date.now(),
        })
      } catch (error) {
        set({ status: 'error' })
        notify(messageFor(error))
      }
    },

    typeLetter(letter) {
      const { status, current, submitting } = get()
      if (status !== 'playing' || submitting) return
      if (current.length >= LENGTH || !/^[a-z]$/i.test(letter)) return
      set({ current: current + letter.toLowerCase() })
    },

    deleteLetter() {
      const { status, current, submitting } = get()
      if (status !== 'playing' || submitting) return
      set({ current: current.slice(0, -1) })
    },

    async submit() {
      const { status, current, submitting, roomId, number, startedAt } = get()
      if (status !== 'playing' || submitting || api === null || roomId === null) return
      if (current.length < LENGTH) {
        notify('Not enough letters', true)
        return
      }

      set({ submitting: true })
      try {
        const game = await api.submitFourGuess({
          roomId,
          number,
          guess: current,
          elapsedMs: Date.now() - (startedAt ?? Date.now()),
        })
        set({ game, current: '', submitting: false, status: statusOf(game) })
      } catch (error) {
        set({ submitting: false })
        // An invalid word is not a guess: the letters stay and the row shakes.
        if (error instanceof GameApiError && isRejection(error.code)) {
          notify(error.message, true)
          return
        }
        notify(messageFor(error))
      }
    },

    async next() {
      await get().load(get().number + 1)
    },

    reset() {
      api = null
      set(initialState)
    },
  }
})

export type QuadKeyState = [Mark | null, Mark | null, Mark | null, Mark | null]

/**
 * What each letter is on each board, for the split keyboard keys.
 *
 * A board only took the guesses up to the one that solved it, so its marks
 * line up with the first `marks.length` words of the shared list. Within a
 * board a key only ever gets better, as on the single-board keyboard.
 */
export function quadKeyStates(game: FourGame | null): Record<string, QuadKeyState> {
  const states: Record<string, QuadKeyState> = {}
  if (game === null) return states

  game.boards.slice(0, FOUR_BOARDS).forEach((board, index) => {
    const rows = board.marks.flatMap((marks, row) => {
      const guess = game.guesses[row]
      return guess === undefined ? [] : [{ guess, marks }]
    })
    for (const [letter, mark] of Object.entries(accumulateKeyStates(rows))) {
      const entry = states[letter] ?? [null, null, null, null]
      entry[index] = mark
      states[letter] = entry
    }
  })

  return states
}
