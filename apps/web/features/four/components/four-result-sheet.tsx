'use client'

import { FOUR_BOARDS } from '@wordroom/shared'
import type { ReactNode } from 'react'
import { Button, Icon, Sheet, StatGrid, StatTile, toast } from '@/components/ui'
import { ForwardIcon, ShareIcon } from '@/components/ui/icons'
import type { FourGame } from '@/features/game/api'
import { shareOrCopy } from '@/features/game/share'
import { cn } from '@/lib/cn'
import { fourShareText } from '../share'

export interface FourResultSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  game: FourGame
  roomCode: string
  nudge?: ReactNode
  onNext: () => void
  loadingNext?: boolean
  preferNativeShare?: boolean
}

/** Per board, the guess that solved it, or null. */
export function solvedAt(game: FourGame): (number | null)[] {
  return game.boards.map((board) => (board.solved ? board.guessCount : null))
}

export function fourResultTitle(boardsSolved: number): string {
  if (boardsSolved === FOUR_BOARDS) return 'All four'
  if (boardsSolved === 0) return 'Not this time'
  return `${boardsSolved} of ${FOUR_BOARDS}`
}

/**
 * The end of a Four at once game: the four words, the points, and the way on.
 *
 * Only spoiler-free sharing. The single board offers "with letters" behind a
 * confirm; four words at once is a much bigger spoiler for the room, for a
 * share nobody has asked for yet.
 */
export function FourResultSheet({
  open,
  onOpenChange,
  game,
  roomCode,
  nudge,
  onNext,
  loadingNext = false,
  preferNativeShare = false,
}: FourResultSheetProps) {
  const solved = solvedAt(game)
  const boardsSolved = solved.filter((n) => n !== null).length
  const points = game.points ?? 0

  async function share() {
    const text = fourShareText({ number: game.number, solvedAt: solved, points, roomCode })
    const outcome = await shareOrCopy(text, { preferNativeShare })
    if (outcome === 'copied') toast('Result copied')
    if (outcome === 'failed') toast('Could not share that')
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Result" hideHeader>
      <div className="pt-2 pb-1 text-center">
        <p className="m-0 text-[30px] font-semibold tracking-[-0.02em]">
          {fourResultTitle(boardsSolved)}
        </p>

        <ul className="mx-auto mt-4 grid max-w-[260px] grid-cols-2 gap-2 p-0">
          {game.boards.map((board) => (
            <li
              key={board.board}
              className={cn(
                'flex list-none items-center justify-between rounded-md px-3 py-2',
                board.solved ? 'bg-correct text-on-tile' : 'bg-surface-2 text-ink',
              )}
            >
              <b className="font-semibold tracking-[0.14em] uppercase">{board.word ?? '—'}</b>
              <span className="tabular text-[13px]">{board.solved ? board.guessCount : '✕'}</span>
            </li>
          ))}
        </ul>

        <StatGrid className="mt-[18px] mb-4">
          <StatTile value={points} label="points" />
          <StatTile value={`${boardsSolved}/${FOUR_BOARDS}`} label="boards" />
          <StatTile value={game.guesses.length} label="guesses" />
        </StatGrid>

        <div className="grid grid-cols-2 gap-2.5">
          <Button onClick={() => void share()}>
            <Icon icon={ShareIcon} size={18} />
            Share
          </Button>
          <Button variant="primary" loading={loadingNext} onClick={onNext}>
            <Icon icon={ForwardIcon} size={18} />
            Next puzzle
          </Button>
        </div>

        {nudge}
      </div>
    </Sheet>
  )
}
