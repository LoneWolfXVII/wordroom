import type { Mark } from '@wordroom/shared'
import type { CSSProperties } from 'react'
import { cn } from '@/lib/cn'
import styles from './board.module.css'

/**
 * `.tile`.
 *
 * A tile carries its final appearance from the moment it is scored; the flip
 * animation is what hides that until the halfway point. See board.module.css —
 * doing it that way means a reduced-motion viewer, or anyone who arrives at a
 * finished board, sees the right colours with no timers involved.
 *
 * `--mark` is read by the flip keyframes. It has to travel with the background
 * class, so both live in one entry here.
 */
const MARK_CLASS: Record<Mark, string> = {
  correct: 'border-transparent bg-correct text-on-tile [--mark:var(--color-correct)]',
  present: 'border-transparent bg-present text-on-tile [--mark:var(--color-present)]',
  absent: 'border-transparent bg-absent text-on-tile [--mark:var(--color-absent)]',
}

export interface TileProps {
  letter: string
  /** Null until the server has scored the row this tile is in. */
  mark: Mark | null
  /** Play the reveal flip, delayed by its position in the row. */
  flip?: boolean
  /** Play the solve bounce. */
  bounce?: boolean
  /** Milliseconds before this tile's animation starts. */
  delayMs?: number
}

export function Tile({ letter, mark, flip = false, bounce = false, delayMs = 0 }: TileProps) {
  const delay = {
    '--flip-delay': `${delayMs}ms`,
    '--bounce-delay': `${delayMs}ms`,
  } as CSSProperties

  return (
    <div
      className={cn(
        'grid h-[var(--tile-size)] w-[var(--tile-size)] place-items-center',
        'rounded-sm border-[1.5px] text-[24px] font-semibold uppercase',
        'transition-[border-color] duration-(--duration-state)',
        mark === null
          ? // An unrevealed tile darkens its border once it holds a letter, and
            // pops as the letter lands.
            cn('bg-surface text-ink', letter ? 'animate-pop border-line-2' : 'border-line')
          : MARK_CLASS[mark],
        flip && styles.flip,
        bounce && styles.bounce,
      )}
      style={delay}
    >
      {letter}
    </div>
  )
}
