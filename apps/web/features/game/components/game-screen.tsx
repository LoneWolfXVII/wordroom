'use client'

import { useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import { Button, Icon, Screen } from '@/components/ui'
import { ForwardIcon, ResultIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import { useMediaQuery } from '@/lib/use-media-query'
import {
  useClock,
  useGameNotices,
  usePhysicalKeyboard,
  useResultSheet,
  useRevealChoreography,
} from '../hooks'
import { BACKSPACE_KEY, ENTER_KEY, type KeyValue } from '../keys'
import { useGameStore } from '../store'
import { clockLabel } from '../timer'
import { Board } from './board'
import styles from './board.module.css'
import { GameHeader } from './game-header'
import { Keyboard } from './keyboard'
import { type RankDelta, ResultSheet } from './result-sheet'

/** A phone shares through the OS sheet; a desktop browser copies. */
const COARSE_POINTER = '(pointer: coarse)'

export interface GameScreenProps {
  /** Opens workstream 3's room sheet. */
  onOpenRoom?: () => void
  /** Opens workstream 4's leaderboard sheet. */
  onOpenLeaderboard?: () => void
  /** Opens workstream 4's settings sheet. */
  onOpenSettings?: () => void
  /** Puts the accent dot on the leaderboard button. */
  leaderboardUpdate?: boolean
  /** Workstream 4 computes this; the sheet only reads the two numbers. */
  rank?: RankDelta | null
  /** Workstream 3's save-progress nudge. */
  nudge?: ReactNode
  /** Show the word-length switcher. Off only in harnesses that pin one mode. */
  showModes?: boolean
}

/**
 * The game screen.
 *
 * One viewport, no scroll: header, board and keyboard are the three rows of a
 * flex column and the board's stage is the only one that flexes. That is what
 * keeps it inside 375x667 and 360x640 — see board.module.css for the tile and
 * key sizes that shrink under 660px tall.
 */
export function GameScreen({
  onOpenRoom,
  onOpenLeaderboard,
  onOpenSettings,
  leaderboardUpdate = false,
  rank = null,
  nudge,
  showModes = true,
}: GameScreenProps) {
  const reduced = useReducedMotion() ?? false
  const nativeShare = useMediaQuery(COARSE_POINTER)

  const room = useGameStore((state) => state.room)
  const puzzle = useGameStore((state) => state.puzzle)
  const mode = useGameStore((state) => state.mode)
  const guesses = useGameStore((state) => state.guesses)
  const current = useGameStore((state) => state.current)
  const status = useGameStore((state) => state.status)
  const keyStates = useGameStore((state) => state.keyStates)
  const revealingRow = useGameStore((state) => state.revealingRow)
  const bounceRow = useGameStore((state) => state.bounceRow)
  const shakeToken = useGameStore((state) => state.shakeToken)
  const boardPhase = useGameStore((state) => state.boardPhase)
  const revealedWord = useGameStore((state) => state.revealedWord)
  const hardMode = useGameStore((state) => state.hardMode)
  const timerMode = useGameStore((state) => state.timerMode)
  const frozenMs = useGameStore((state) => state.frozenMs)
  const resultOpen = useGameStore((state) => state.resultOpen)

  const typeLetter = useGameStore((state) => state.typeLetter)
  const deleteLetter = useGameStore((state) => state.deleteLetter)
  const submit = useGameStore((state) => state.submit)
  const closeResult = useGameStore((state) => state.closeResult)
  const openResult = useGameStore((state) => state.openResult)
  const resultDismissed = useGameStore((state) => state.resultDismissed)
  const nextPuzzle = useGameStore((state) => state.nextPuzzle)
  const setMode = useGameStore((state) => state.setMode)

  const clock = useClock()
  useRevealChoreography(reduced)
  useResultSheet(reduced)
  useGameNotices()

  const accepting = status === 'playing'

  function onKey(key: KeyValue) {
    if (key === ENTER_KEY) {
      void submit()
      return
    }
    if (key === BACKSPACE_KEY) {
      deleteLetter()
      return
    }
    typeLetter(key)
  }

  usePhysicalKeyboard(onKey, accepting && !resultOpen)

  const failed = status === 'failed'
  /*
   * Whether to show the end-of-attempt actions instead of the keyboard.
   *
   * Gated on the result having been *dismissed*, not merely on the attempt
   * being over. The sheet opens on a settle timer a few hundred milliseconds
   * after the status flips, so swapping the keyboard for these at the flip put
   * a layout change directly under a drawer that was starting to slide up —
   * two movements at once, which reads as a stutter. The drawer now opens over
   * the keyboard exactly as it always did, and these appear only once it has
   * gone.
   *
   * `loading` is included, but only once a row has been played: that is the
   * board swap into the next puzzle, and without it the dead keyboard flashes
   * back for the length of the animation. On the very first load there are no
   * guesses and the keyboard is the right thing to be showing.
   */
  const attemptOver =
    status === 'solved' || status === 'failed' || (status === 'loading' && guesses.length > 0)
  const showEndActions = attemptOver && resultDismissed && !resultOpen
  const timed = timerMode !== 'off'
  const subtitle =
    clockLabel(clock, timerMode) ??
    (puzzle === null
      ? 'Getting your puzzle'
      : `Puzzle ${puzzle.number} in ${room?.name ?? 'this room'}`)

  return (
    <Screen className={styles.game}>
      <GameHeader
        roomName={room?.name ?? null}
        number={puzzle?.number ?? null}
        subtitle={subtitle}
        timed={timed}
        urgent={clock.urgent}
        mode={mode}
        onModeChange={(next) => void setMode(next)}
        showModes={showModes}
        onOpenRoom={onOpenRoom}
        onOpenLeaderboard={onOpenLeaderboard}
        onOpenSettings={onOpenSettings}
        leaderboardUpdate={leaderboardUpdate}
      />

      <main className="relative grid min-h-0 flex-1 place-items-center [container-type:inline-size]">
        <Board
          mode={mode}
          guesses={guesses}
          current={current}
          revealingRow={revealingRow}
          bounceRow={bounceRow}
          shakeToken={shakeToken}
          dimmed={failed}
          phase={boardPhase}
          reduced={reduced}
        />
        <p
          className={cn(
            'absolute right-0 bottom-1 left-0 m-0 text-center text-[13px] text-muted',
            'transition-all duration-(--duration-struct) ease-out',
            failed && revealedWord !== null
              ? 'translate-y-0 opacity-100'
              : 'translate-y-1.5 opacity-0',
          )}
        >
          The word was{' '}
          <b className="font-semibold tracking-[0.12em] text-ink">
            {(revealedWord ?? '').toUpperCase()}
          </b>
        </p>
      </main>

      {/*
       * The attempt is over and the sheet has been dismissed.
       *
       * What used to be here was the keyboard, disabled — every key dead, no
       * way to the next puzzle and no way back to the result. `openResult` was
       * reachable only from the settle timer that opens the sheet in the first
       * place, so dismissing the drawer once was a dead end and the only way on
       * was a reload.
       *
       * The height is reserved to the keyboard's exactly (three rows, its two
       * gaps and its padding) so the board does not jump when one replaces the
       * other.
       */}
      {showEndActions ? (
        <div className="flex min-h-[calc(var(--key-height)*3+28px)] flex-none items-center pb-2.5">
          <div className="grid w-full grid-cols-2 gap-2.5">
            <Button
              variant="primary"
              loading={status === 'loading'}
              onClick={() => void nextPuzzle()}
            >
              <Icon icon={ForwardIcon} size={18} />
              Next puzzle
            </Button>
            <Button onClick={openResult}>
              <Icon icon={ResultIcon} size={18} />
              View result
            </Button>
          </div>
        </div>
      ) : (
        <Keyboard keyStates={keyStates} onKey={onKey} disabled={!accepting} />
      )}

      <ResultSheet
        open={resultOpen}
        onOpenChange={(open) => {
          if (!open) closeResult()
        }}
        puzzleNumber={puzzle?.number ?? 1}
        guesses={guesses}
        solved={status === 'solved'}
        word={revealedWord}
        hardMode={hardMode}
        elapsedMs={timed ? frozenMs : null}
        roomCode={room?.code ?? ''}
        rank={rank}
        nudge={nudge}
        onNext={() => void nextPuzzle()}
        loadingNext={status === 'loading'}
        preferNativeShare={nativeShare}
      />
    </Screen>
  )
}
