'use client'

import { MAX_GUESSES, type ScoredGuess } from '@wordroom/shared'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Badge, Button, Icon, MiniGrid, Sheet, StatGrid, StatTile, toast } from '@/components/ui'
import { LettersIcon } from '@/components/ui/icons'
import {
  lettersShareWarning,
  type ShareInput,
  shareOrCopy,
  spoilerFreeShare,
  withLettersShare,
} from '../share'
import { formatClock } from '../timer'

/**
 * The rank a player moved to, and where they were before.
 *
 * Workstream 4 owns the leaderboard and computes this. The result sheet only
 * needs the two numbers, so it takes them as a value rather than importing
 * anything from their folder.
 */
export interface RankDelta {
  /** Rank before this puzzle, or null if they had not been placed yet. */
  before: number | null
  after: number
}

export interface ResultSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  puzzleNumber: number
  guesses: readonly ScoredGuess[]
  solved: boolean
  /** The word. Only ever passed once the attempt is solved, failed or timed out. */
  word: string | null
  hardMode: boolean
  /** Time on the puzzle, or null when the timer was off. */
  elapsedMs: number | null
  roomCode: string
  rank?: RankDelta | null
  /** Workstream 3's save-progress nudge, shown after the first result. */
  nudge?: ReactNode
  onNext: () => void
  /** True while the next puzzle is being fetched. */
  loadingNext?: boolean
  /** Native share sheet rather than the clipboard — right on a phone, wrong on a desktop. */
  preferNativeShare?: boolean
}

/**
 * The result moment.
 *
 * Same sheet whether the puzzle was solved or lost; a loss just loses the
 * celebration and says what the word was. Everything in it is already known to
 * the client by the time it opens — the word arrived with the finishing guess.
 */
export function ResultSheet({
  open,
  onOpenChange,
  puzzleNumber,
  guesses,
  solved,
  word,
  hardMode,
  elapsedMs,
  roomCode,
  rank = null,
  nudge,
  onNext,
  loadingNext = false,
  preferNativeShare = false,
}: ResultSheetProps) {
  const [confirmingLetters, setConfirmingLetters] = useState(false)

  // A fresh result never opens with the previous puzzle's confirm still showing.
  useEffect(() => {
    if (!open) setConfirmingLetters(false)
  }, [open])

  const input: ShareInput = {
    puzzleNumber,
    guesses,
    solved,
    hardMode,
    elapsedMs,
    roomCode,
  }

  async function share(text: string) {
    const outcome = await shareOrCopy(text, { preferNativeShare })
    if (outcome === 'copied') toast('Result copied')
    if (outcome === 'failed') toast('Could not share that')
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Result" hideHeader>
      <div className="pt-2 pb-1 text-center">
        <p className="m-0 text-[30px] font-semibold tracking-[-0.02em]">
          {resultTitle(solved, guesses.length)}
          {hardMode ? <Badge>HARD</Badge> : null}
        </p>

        {word === null ? null : (
          <p className="mt-1.5 mb-0 text-sm text-muted">
            {solved ? 'Everyone in the room gets ' : 'The word was '}
            <b className="font-semibold tracking-[0.14em] text-ink">{word.toUpperCase()}</b>
            {solved ? ' too' : ''}
          </p>
        )}

        <StatGrid className="mt-[22px] mb-2.5">
          <StatTile value={solved ? guesses.length : '—'} label="guesses" />
          <StatTile value={elapsedMs === null ? '—' : formatClock(elapsedMs)} label="time" />
          <StatTile
            value={rankLabel(rank)}
            label="rank"
            positive={rank !== null && rank.before !== null && rank.after < rank.before}
          />
        </StatGrid>

        <MiniGrid
          size="lg"
          rows={guesses.map((row) => row.marks)}
          className="mx-auto mt-3.5 mb-5"
          label={`Your grid for puzzle ${puzzleNumber}`}
        />

        {confirmingLetters ? (
          <div className="rounded-md bg-surface-2 p-3.5 text-left">
            <p className="m-0 text-[13px] leading-[1.4] text-ink-2">
              {lettersShareWarning(puzzleNumber)}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <Button size="sm" className="w-full" onClick={() => setConfirmingLetters(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="primary"
                className="w-full"
                onClick={() => {
                  setConfirmingLetters(false)
                  void share(withLettersShare(input))
                }}
              >
                Share anyway
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              <Button onClick={() => void share(spoilerFreeShare(input))}>Share</Button>
              <Button variant="primary" loading={loadingNext} onClick={onNext}>
                Next puzzle
              </Button>
            </div>
            {/*
             * The icon is the half of the label that matters. This sits under
             * a "Share" that does not spoil anything, and the only difference
             * between them is whether the word goes out with the grid - so the
             * letters say so before the sentence does.
             */}
            <Button
              variant="ghost"
              className="mt-1 text-[13px]"
              onClick={() => setConfirmingLetters(true)}
            >
              <Icon icon={LettersIcon} size={16} />
              Share with letters
            </Button>
          </>
        )}

        {nudge}
      </div>
    </Sheet>
  )
}

/**
 * The title tiers.
 *
 * A first-guess solve is luck worth naming; a sixth-guess solve is a near miss
 * worth naming. Everything between is stated plainly, because overselling an
 * ordinary result is how a game starts to feel like it is congratulating itself.
 */
export function resultTitle(solved: boolean, guessCount: number): string {
  if (!solved) return 'Not this time'
  if (guessCount === 1) return 'First guess. Genius.'
  if (guessCount >= MAX_GUESSES) return `Close call. Solved in ${MAX_GUESSES}`
  return `Solved in ${guessCount}`
}

/** `↑ 2nd`, or an em dash before the leaderboard has placed the player. */
export function rankLabel(rank: RankDelta | null): string {
  if (rank === null) return '—'
  const arrow =
    rank.before === null || rank.before === rank.after ? '' : rank.after < rank.before ? '↑ ' : '↓ '
  return `${arrow}${ordinal(rank.after)}`
}

export function ordinal(value: number): string {
  const teens = value % 100
  if (teens > 10 && teens < 14) return `${value}th`
  const suffix = ['th', 'st', 'nd', 'rd'][value % 10] ?? 'th'
  return `${value}${suffix}`
}
