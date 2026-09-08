'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from '@/components/ui'
import { BACKSPACE_KEY, ENTER_KEY, type KeyValue } from './keys'
import { keyColourMs, rowRevealMs, settleMs } from './motion'
import { useGameStore } from './store'
import { type Clock, computeClock, TICK_MS } from './timer'

/**
 * Physical keyboard input, without a hidden `<input>`.
 *
 * A document-level `keydown` listener is the whole mechanism. The alternative —
 * an off-screen focused field — is what the spec rules out: it summons the
 * on-screen keyboard on a phone and pushes the board out of the viewport, and
 * it puts a control in the tab order that says nothing useful.
 */
export function usePhysicalKeyboard(onKey: (key: KeyValue) => void, enabled: boolean): void {
  const handler = useRef(onKey)
  handler.current = onKey

  useEffect(() => {
    if (!enabled) return

    function onKeyDown(event: KeyboardEvent) {
      // Leave shortcuts, and anything typed into a real field, alone.
      if (event.metaKey || event.ctrlKey || event.altKey) return

      const target = event.target as HTMLElement | null
      if (target?.isContentEditable) return
      if (target && /^(input|textarea|select)$/i.test(target.tagName)) return

      // A sheet is a modal dialog: while one is open it owns the keyboard.
      if (document.querySelector('[role="dialog"][data-state="open"]') !== null) return

      if (event.key === 'Enter') {
        // A focused button already turns Enter into a click. Handling it here
        // as well would submit the same guess twice.
        if ((target?.closest('button') ?? null) !== null) return
        event.preventDefault()
        handler.current(ENTER_KEY)
        return
      }

      if (event.key === 'Backspace') {
        event.preventDefault()
        handler.current(BACKSPACE_KEY)
        return
      }

      if (/^[a-zA-Z]$/.test(event.key)) handler.current(event.key.toLowerCase())
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}

/**
 * The clock.
 *
 * Ticks only while a timed puzzle is in play, so an idle board and a finished
 * one cost nothing. When a countdown reaches zero it finishes the attempt
 * through the server, because a timeout is a fail and only the server may
 * record one.
 */
export function useClock(): Clock {
  const timerMode = useGameStore((state) => state.timerMode)
  const perPuzzleSeconds = useGameStore((state) => state.perPuzzleSeconds)
  const startedAt = useGameStore((state) => state.startedAt)
  const guessStartedAt = useGameStore((state) => state.guessStartedAt)
  const frozenMs = useGameStore((state) => state.frozenMs)
  const status = useGameStore((state) => state.status)
  const timeout = useGameStore((state) => state.timeout)

  const [now, setNow] = useState(() => Date.now())
  const live = timerMode !== 'off' && (status === 'playing' || status === 'revealing')

  useEffect(() => {
    if (!live) return
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [live])

  const clock = computeClock({
    timerMode,
    perPuzzleSeconds,
    startedAt,
    guessStartedAt,
    frozenMs,
    now,
  })

  const expired = clock.expired && status === 'playing'
  useEffect(() => {
    if (expired) void timeout()
  }, [expired, timeout])

  return clock
}

/**
 * The reveal.
 *
 * Tiles flip in CSS; this schedules the two things CSS cannot do — colouring
 * each key as its tile lands, and telling the store the row has finished so the
 * outcome can be applied. With motion reduced every delay collapses to zero, so
 * the result arrives immediately instead of after a second of stillness.
 */
export function useRevealChoreography(reduced: boolean): void {
  const revealingRow = useGameStore((state) => state.revealingRow)
  const guesses = useGameStore((state) => state.guesses)
  const colourKey = useGameStore((state) => state.colourKey)
  const finishReveal = useGameStore((state) => state.finishReveal)

  useEffect(() => {
    if (revealingRow === null) return
    const row = guesses[revealingRow]
    if (row === undefined) return

    const timers: ReturnType<typeof setTimeout>[] = []
    for (let index = 0; index < row.marks.length; index++) {
      const letter = row.guess[index]
      if (letter === undefined) continue
      timers.push(setTimeout(() => colourKey(letter, index), keyColourMs(index, reduced)))
    }
    timers.push(setTimeout(finishReveal, rowRevealMs(row.marks.length, reduced)))

    return () => {
      for (const timer of timers) clearTimeout(timer)
    }
  }, [revealingRow, guesses, colourKey, finishReveal, reduced])
}

/**
 * The result sheet, once the celebration has played.
 *
 * Opened at most once per attempt: closing the sheet to look at the board must
 * not spring it open again, and the player can reopen it themselves.
 */
export function useResultSheet(reduced: boolean): void {
  const status = useGameStore((state) => state.status)
  const mode = useGameStore((state) => state.mode)
  const puzzleId = useGameStore((state) => state.puzzle?.id ?? null)
  const openResult = useGameStore((state) => state.openResult)
  const shownFor = useRef<string | null>(null)

  useEffect(() => {
    if (status !== 'solved' && status !== 'failed') return
    if (puzzleId === null || shownFor.current === puzzleId) return
    shownFor.current = puzzleId

    const timer = setTimeout(openResult, settleMs(mode, status === 'solved', reduced))
    return () => clearTimeout(timer)
  }, [status, mode, puzzleId, openResult, reduced])
}

/** Surface the store's one-line messages as toasts. */
export function useGameNotices(): void {
  const notice = useGameStore((state) => state.notice)

  useEffect(() => {
    if (notice === null) return
    toast(notice.message)
  }, [notice])
}
