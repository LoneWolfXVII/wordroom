/**
 * Marks for the screens that have nothing to show.
 *
 * All drawn from the same thing: a row of tiles, the width of a guess. It is
 * the only shape this product has — the board, the keys, the room mark on the
 * home screen — and it means an empty screen still looks like Wordroom rather
 * than like a stock illustration set.
 *
 * Each variant changes one property of that row and nothing else, so they read
 * as a family:
 *
 *   `waiting`  a row not yet played, outlines only
 *   `absent`   a row that came back with nothing, filled the board's grey
 *   `lost`     a row with a tile out of place and its slot left dashed
 *   `broken`   a row with a gap in the middle, the tiles either side pushed out
 *
 * Rectangles, one rotation at most. No gradient, no character, no scene: the
 * brief rules out illustration and none of this crosses that line. Colours come
 * from the palette's own custom properties, so a mark cannot drift from the
 * board it is imitating.
 */

export type TileArtVariant = 'waiting' | 'absent' | 'lost' | 'broken'

const DEFAULT_TITLE: Record<TileArtVariant, string> = {
  waiting: 'An empty row of letter tiles',
  absent: 'A row of letter tiles, all greyed out',
  lost: 'A row of letter tiles with one out of place',
  broken: 'A row of letter tiles with a gap in the middle',
}

const TILE = 30
const GAP = 8
const WIDTH = TILE * 5 + GAP * 4
const START = (200 - WIDTH) / 2
const ROW_Y = 58

const x = (index: number) => START + index * (TILE + GAP)

interface TileArtProps {
  variant: TileArtVariant
  /** Announced to screen readers. Decorative when omitted. */
  label?: string
  className?: string
}

export function TileArt({ variant, label, className }: TileArtProps) {
  // `aria-hidden` alone does not satisfy the lint rule, and a title with no
  // text is worse than none, so a decorative mark still names its shape. It is
  // never announced: `aria-hidden` takes it out of the tree either way.
  const title = label ?? DEFAULT_TITLE[variant]
  const a11y = label
    ? { role: 'img' as const, 'aria-label': label }
    : { 'aria-hidden': true as const }

  return (
    <svg
      viewBox="0 0 200 104"
      className={className ?? 'mx-auto mb-6 h-[104px] w-[200px]'}
      {...a11y}
    >
      <title>{title}</title>
      {variant === 'waiting' ? <Waiting /> : null}
      {variant === 'absent' ? <Absent /> : null}
      {variant === 'lost' ? <Lost /> : null}
      {variant === 'broken' ? <Broken /> : null}
    </svg>
  )
}

/** An unplayed row: five outlines, the board before anyone has guessed. */
function Waiting() {
  return (
    <>
      {[0, 1, 2, 3, 4].map((index) => (
        <rect
          key={index}
          x={x(index)}
          y={ROW_Y}
          width={TILE}
          height={TILE}
          rx={6}
          fill="var(--color-surface)"
          stroke="var(--color-line-2)"
          strokeWidth={1.5}
        />
      ))}
    </>
  )
}

/**
 * A played row where every letter was absent. The board's own way of saying
 * "nothing here yet" — which is exactly what a leaderboard with no scores is.
 */
function Absent() {
  return (
    <>
      {[0, 1, 2, 3, 4].map((index) => (
        <rect
          key={index}
          x={x(index)}
          y={ROW_Y}
          width={TILE}
          height={TILE}
          rx={6}
          fill="var(--color-absent)"
          opacity={0.35 + index * 0.06}
        />
      ))}
    </>
  )
}

/** A tile lifted clear of the row, its slot left dashed. Something did not land. */
function Lost() {
  return (
    <>
      {[0, 1, 3, 4].map((index) => (
        <rect
          key={index}
          x={x(index)}
          y={ROW_Y}
          width={TILE}
          height={TILE}
          rx={6}
          fill="var(--color-surface)"
          stroke="var(--color-line-2)"
          strokeWidth={1.5}
        />
      ))}
      <rect
        x={x(2)}
        y={ROW_Y}
        width={TILE}
        height={TILE}
        rx={6}
        fill="none"
        stroke="var(--color-line-2)"
        strokeWidth={1.5}
        strokeDasharray="4 4"
      />
      <g transform={`rotate(-13 ${x(2) + TILE / 2} ${ROW_Y - 26})`}>
        <rect
          x={x(2)}
          y={ROW_Y - 41}
          width={TILE}
          height={TILE}
          rx={6}
          fill="var(--color-absent)"
        />
      </g>
    </>
  )
}

/**
 * A row split open: two tiles either side, pushed apart, nothing in the middle.
 * For the address that leads nowhere and the render that threw — the shape is
 * intact at the edges and missing where you were headed.
 */
function Broken() {
  const shove = 7
  return (
    <>
      {[0, 1].map((index) => (
        <rect
          key={index}
          x={x(index) - shove}
          y={ROW_Y}
          width={TILE}
          height={TILE}
          rx={6}
          fill="var(--color-surface)"
          stroke="var(--color-line-2)"
          strokeWidth={1.5}
        />
      ))}
      {[3, 4].map((index) => (
        <rect
          key={index}
          x={x(index) + shove}
          y={ROW_Y}
          width={TILE}
          height={TILE}
          rx={6}
          fill="var(--color-surface)"
          stroke="var(--color-line-2)"
          strokeWidth={1.5}
        />
      ))}
    </>
  )
}
