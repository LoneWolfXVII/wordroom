'use client'

import type { Mode } from '@wordroom/shared'
import { type CSSProperties, type ReactNode, useEffect } from 'react'
import { Button, Icon, Screen, toast } from '@/components/ui'
import { ForwardIcon, ResultIcon } from '@/components/ui/icons'
import { GameHeader, Keyboard, usePhysicalKeyboard } from '@/features/game'
import styles from '@/features/game/components/board.module.css'
import { BACKSPACE_KEY, ENTER_KEY, type KeyValue } from '@/features/game/keys'
import { quadKeyStates, useFourStore } from '../store'
import { MiniBoard } from './mini-board'

export interface FourScreenProps {
  roomName: string | null
  mode: Mode
  onModeChange: (mode: Mode) => void
  onOpenRoom?: () => void
  onOpenLeaderboard?: () => void
  onOpenSettings?: () => void
  /** The finished game's result: Task 8's sheet, opened on demand. */
  result?: ReactNode
  resultOpen: boolean
  onOpenResult: () => void
}

/*
 * Two boards across and two down in whatever the header and keyboard leave.
 * Each board is 5 tiles wide and 9 tall, with 3px between tiles and 10px
 * between boards, so the tile is the largest that fits both ways, capped so a
 * desktop window does not blow the boards up.
 */
const BOARD_METRICS = {
  '--four-gap': '3px',
  '--tile-size':
    'min(30px, calc((100cqh - 16 * var(--four-gap) - 10px) / 18), calc((100cqw - 8 * var(--four-gap) - 10px) / 10))',
  '--tile-font': 'calc(var(--tile-size) * 0.58)',
} as CSSProperties

/**
 * Four at once: four 5-letter words, nine guesses, every guess on every
 * unsolved board. One viewport and no scroll, like the single board.
 */
export function FourScreen({
  roomName,
  mode,
  onModeChange,
  onOpenRoom,
  onOpenLeaderboard,
  onOpenSettings,
  result,
  resultOpen,
  onOpenResult,
}: FourScreenProps) {
  const game = useFourStore((state) => state.game)
  const current = useFourStore((state) => state.current)
  const status = useFourStore((state) => state.status)
  const submitting = useFourStore((state) => state.submitting)
  const shakeToken = useFourStore((state) => state.shakeToken)
  const notice = useFourStore((state) => state.notice)
  const typeLetter = useFourStore((state) => state.typeLetter)
  const deleteLetter = useFourStore((state) => state.deleteLetter)
  const submit = useFourStore((state) => state.submit)
  const next = useFourStore((state) => state.next)
  const retry = useFourStore((state) => state.retry)

  useEffect(() => {
    if (notice !== null) toast(notice.message)
  }, [notice])

  const playing = status === 'playing'
  const finished = status === 'won' || status === 'over'

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

  usePhysicalKeyboard(onKey, playing && !resultOpen)

  const subtitle =
    game === null ? 'Getting your puzzle' : `Four at once in ${roomName ?? 'this room'}`

  return (
    <Screen className={styles.game}>
      <GameHeader
        roomName={roomName}
        number={game?.number ?? null}
        subtitle={subtitle}
        mode={mode}
        onModeChange={onModeChange}
        onOpenRoom={onOpenRoom}
        onOpenLeaderboard={onOpenLeaderboard}
        onOpenSettings={onOpenSettings}
      />

      <main
        className="relative grid min-h-0 flex-1 place-items-center py-2 [container-type:size]"
        style={BOARD_METRICS}
      >
        {status === 'error' ? <Button onClick={() => void retry()}>Try again</Button> : null}
        {game === null ? null : (
          <div className="grid grid-cols-2 gap-[10px]">
            {game.boards.map((board) => (
              <MiniBoard
                key={board.board}
                board={board.board}
                guesses={game.guesses}
                marks={board.marks}
                solved={board.solved}
                word={board.word}
                current={current}
                active={playing && !board.solved}
                shakeToken={shakeToken}
              />
            ))}
          </div>
        )}
      </main>

      {finished && !resultOpen ? (
        <div className="flex min-h-[calc(var(--key-height)*3+28px)] flex-none items-center pb-2.5">
          <div className="grid w-full grid-cols-2 gap-2.5">
            <Button variant="primary" onClick={() => void next()}>
              <Icon icon={ForwardIcon} size={18} />
              Next puzzle
            </Button>
            <Button onClick={onOpenResult}>
              <Icon icon={ResultIcon} size={18} />
              View result
            </Button>
          </div>
        </div>
      ) : (
        <Keyboard
          keyStates={{}}
          splitStates={quadKeyStates(game)}
          onKey={onKey}
          disabled={!playing || submitting}
        />
      )}

      {result}
    </Screen>
  )
}
