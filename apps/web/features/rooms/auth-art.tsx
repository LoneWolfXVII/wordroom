/**
 * The mark on the sign-in failure screen.
 *
 * Drawn rather than borrowed. The icon set has an alert triangle, but a warning
 * glyph in a rounded box is the same picture every app shows for every problem,
 * and it says nothing about *this* product or *this* failure.
 *
 * So it is built from the only shape Wordroom has: the tile. A row of five, the
 * width of a guess, with the middle one lifted out of line and the slot it came
 * from left as a dashed outline. That is the whole story of this screen — the
 * step that should have completed did not, and the rest of the row is untouched,
 * which is exactly what the copy underneath promises about the player's room and
 * name.
 *
 * Geometry only: rectangles, one rotation, no gradient, no character, no scene.
 * The brief rules out illustration and this stays inside it. Colours are read
 * from the same custom properties Tailwind generates for the palette, so the
 * mark cannot drift from the board it is imitating.
 */
export function AuthFailureArt() {
  // Five 30px tiles with 8px gutters: 5*30 + 4*8 = 182, centred in a 200 box.
  const TILE = 30
  const GAP = 8
  const START = (200 - (TILE * 5 + GAP * 4)) / 2
  const ROW_Y = 58
  const x = (index: number) => START + index * (TILE + GAP)

  return (
    <svg
      viewBox="0 0 200 104"
      role="img"
      aria-label="A row of letter tiles with the middle one out of place"
      className="mx-auto mb-6 h-[104px] w-[200px]"
    >
      <title>A row of letter tiles with the middle one out of place</title>

      {/* The settled tiles. Two either side, filled the way an untouched board
          is filled, so the row reads as intact apart from one place. */}
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

      {/* The slot the loose tile belongs in. Dashed, because it is an absence
          rather than a thing — the same reason an empty board row is an outline
          and a played one is not. */}
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

      {/* The tile that did not land. Lifted a tile's height clear of the row and
          tipped, so the eye reads it as still in the air rather than placed
          somewhere else. `absent` grey: the board's own colour for a letter that
          turned out not to belong. */}
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
    </svg>
  )
}
