'use client'

import { MODES, type Mode } from '@wordroom/shared'
import { useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import { Icon, IconButton, Screen, SegmentedControl } from '@/components/ui'
import { ForwardIcon, LeaderboardIcon, SettingsIcon } from '@/components/ui/icons'
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
import { Keyboard } from './keyboard'
import { PuzzleNumber } from './puzzle-number'
import { type RankDelta, ResultSheet } from './result-sheet'

const MODE_OPTIONS = MODES.map((mode) => ({ value: String(mode), label: String(mode) }))

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
  /** The 6- and 7-letter modes are P1; hide the switcher until they ship. */
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
  const timed = timerMode !== 'off'
  const subtitle =
    clockLabel(clock, timerMode) ??
    (puzzle === null
      ? 'Getting your puzzle'
      : `Puzzle ${puzzle.number} in ${room?.name ?? 'this room'}`)

  return (
    <Screen className={styles.game}>
      {/*
       * `minmax(0,1fr)`, not `1fr`. A bare `1fr` is `minmax(auto,1fr)`, so a
       * column refuses to shrink below its content — and the room-name button
       * on the left is wider than the two icons on the right, so it took more
       * than its half and pushed the puzzle number off centre. A long room name
       * moved "No. 2" 25px to the right of the board it sits above.
       *
       * Zero as the floor lets both sides settle equal and truncate instead.
       * The number is what has to be centred; the room name already ellipsises.
       */}
      <header className="grid min-h-14 flex-none grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center pt-1.5">
        <div>
          {onOpenRoom === undefined ? null : (
            <button
              type="button"
              onClick={onOpenRoom}
              className={cn(
                'inline-flex h-9 max-w-[150px] items-center gap-1.5 rounded-md pr-2.5 pl-3',
                'text-sm font-medium text-ink-2 transition-colors duration-(--duration-micro) active:bg-surface-2',
              )}
            >
              <span className="truncate">{room?.name ?? 'Room'}</span>
              <Icon icon={ForwardIcon} size={16} />
            </button>
          )}
        </div>

        <div className="text-center leading-none">
          <PuzzleNumber number={puzzle?.number ?? 1} />
          <div
            className={cn(
              'mt-[3px] text-[12px] text-muted',
              timed && 'tabular',
              clock.urgent && 'text-accent',
            )}
          >
            {subtitle}
          </div>
        </div>

        <div className="flex justify-end gap-0.5">
          {onOpenLeaderboard === undefined ? null : (
            <IconButton
              icon={LeaderboardIcon}
              label="Leaderboard"
              notification={leaderboardUpdate}
              onClick={onOpenLeaderboard}
            />
          )}
          {onOpenSettings === undefined ? null : (
            <IconButton icon={SettingsIcon} label="Settings" onClick={onOpenSettings} />
          )}
        </div>
      </header>

      {showModes ? (
        <div className="mt-1 flex flex-none justify-center">
          <SegmentedControl
            options={MODE_OPTIONS}
            value={String(mode)}
            onValueChange={(next) => void setMode(Number(next) as Mode)}
            label="Word length"
          />
        </div>
      ) : null}

      <main className="relative grid min-h-0 flex-1 place-items-center">
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

      <Keyboard keyStates={keyStates} onKey={onKey} disabled={!accepting} />

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
