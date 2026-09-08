import type { Mark, MarkRow } from '@wordroom/shared'
import { cn } from '@/lib/cn'

/**
 * `sm` is the leaderboard's `.mini`; `lg` is the result sheet's `.share`.
 * Both are the same grid at two scales.
 */
export type MiniGridSize = 'sm' | 'lg'

const SIZES: Record<MiniGridSize, { square: number; gap: number; radius: number }> = {
  sm: { square: 7, gap: 2, radius: 1.5 },
  lg: { square: 14, gap: 3, radius: 3 },
}

const MARK_CLASS: Record<Mark, string> = {
  correct: 'bg-correct',
  present: 'bg-present',
  absent: 'bg-absent',
}

export interface MiniGridProps {
  /**
   * Decoded `attempts.marks`: one entry per guess, in guess order. Pass the
   * output of `decodeMarks` from `@wordroom/shared` — this is the only colour
   * representation in the app, and there is no second one to convert to.
   *
   * Marks are the spoiler-free projection of an attempt, so this is safe to
   * render for any player in the room. It never carries a letter.
   */
  rows: readonly MarkRow[]
  size?: MiniGridSize
  /**
   * Overrides the generated description. The default reads every row out, which
   * is right for the result sheet; somewhere the grid only repeats what the
   * surrounding row already says, pass a shorter one.
   */
  label?: string
  className?: string
}

function describe(rows: readonly MarkRow[]): string {
  return rows.map((row, index) => `Guess ${index + 1}: ${row.join(', ')}.`).join(' ')
}

/**
 * `.mini` / `.share` — a guess's colours without its letters.
 *
 * Renders nothing when there are no marks yet, so a player who has not started
 * leaves an empty cell rather than an empty box. Rows shorter than the widest
 * one are padded with blank squares, which only happens if a caller mixes
 * modes in one grid.
 *
 * Colour is the whole content, so the grid is an image with a text alternative
 * rather than a pile of unlabelled divs.
 */
export function MiniGrid({ rows, size = 'sm', label, className }: MiniGridProps) {
  if (rows.length === 0) return null

  const { square, gap, radius } = SIZES[size]
  const columns = rows.reduce((widest, row) => Math.max(widest, row.length), 0)
  if (columns === 0) return null

  return (
    <div
      role="img"
      aria-label={label ?? describe(rows)}
      className={cn('grid w-fit', className)}
      style={{
        gap: `${gap}px`,
        gridTemplateColumns: `repeat(${columns}, ${square}px)`,
      }}
    >
      {rows.map((row, rowIndex) =>
        Array.from({ length: columns }, (_, columnIndex) => {
          const mark = row[columnIndex]
          return (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: the grid is positional.
              key={`${rowIndex}:${columnIndex}`}
              className={cn(mark ? MARK_CLASS[mark] : 'bg-line')}
              style={{ width: square, height: square, borderRadius: radius }}
            />
          )
        }),
      )}
    </div>
  )
}
