'use client'

import { FOUR, type MarkRow, maxGuesses, wordLength } from '@wordroom/shared'
import { Tile, useShake } from '@/features/game'
import styles from '@/features/game/components/board.module.css'
import { cn } from '@/lib/cn'

const ROWS = maxGuesses(FOUR)
const LENGTH = wordLength(FOUR)

export interface MiniBoardProps {
  board: number
  /** The game's guesses; this board took the first `marks.length` of them. */
  guesses: readonly string[]
  marks: readonly MarkRow[]
  solved: boolean
  /** The board's word, once solved or the game is over. */
  word: string | null
  /** Letters typed and not yet submitted, drawn on this board's next row. */
  current: string
  /** Whether this board takes the next guess. */
  active: boolean
  shakeToken: number
}

/**
 * One of the four boards: five letters by nine rows.
 *
 * Tiles take their size from `--tile-size` on the Four screen, which fits two
 * of these across and two down in whatever the keyboard leaves. A solved board
 * stops at its winning row, steps back, and shows its word; an unsolved one at
 * the end of the game shows its word the same way, so all four are readable.
 */
export function MiniBoard({
  board,
  guesses,
  marks,
  solved,
  word,
  current,
  active,
  shakeToken,
}: MiniBoardProps) {
  const shaking = useShake(active ? shakeToken : 0)

  return (
    <section
      aria-label={`Board ${board}${solved ? ', solved' : ''}`}
      data-board={board}
      data-solved={solved || undefined}
      className="relative"
    >
      <div
        className={cn(
          'grid gap-[var(--four-gap)] transition-opacity duration-(--duration-struct)',
          word !== null && 'opacity-35',
        )}
      >
        {Array.from({ length: ROWS }, (_, row) => {
          const scored = marks[row]
          const isActive = active && row === marks.length
          const letters = scored ? (guesses[row] ?? '') : isActive ? current : ''
          return (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional.
              key={row}
              className={cn('grid gap-[var(--four-gap)]', isActive && shaking && styles.shake)}
              style={{ gridTemplateColumns: `repeat(${LENGTH}, var(--tile-size))` }}
            >
              {Array.from({ length: LENGTH }, (_, index) => (
                <Tile
                  // biome-ignore lint/suspicious/noArrayIndexKey: tiles are positional.
                  key={index}
                  letter={letters[index] ?? ''}
                  mark={scored?.[index] ?? null}
                />
              ))}
            </div>
          )
        })}
      </div>

      {word !== null ? (
        <p
          className={cn(
            'absolute inset-0 m-0 grid place-items-center text-[15px] font-semibold uppercase',
            'tracking-[0.14em]',
            solved ? 'text-correct' : 'text-ink',
          )}
        >
          {word}
        </p>
      ) : null}
    </section>
  )
}
