import { brand, TILE_RADIUS_RATIO } from './brand'
import { type CardInput, cardHeadline } from './headline'

/**
 * The share card: the result sheet's grid, drawn big enough to post.
 *
 * 1080x1350 is Instagram's portrait frame, and it is the shape that survives
 * everywhere else — WhatsApp shows it inline without cropping the grid out, and
 * a feed post gets the tallest slot the platform gives away. The card is the
 * share *text* laid out rather than a second design: same headline, same rows,
 * same link line, so a grid pasted into the chat and a card posted to a story
 * say the same thing about the same puzzle.
 */

export const CARD_WIDTH = 1080
export const CARD_HEIGHT = 1350

const PADDING = 76
const TILE_GAP = 12
const MAX_TILE = 132

const TILE_COLOURS = {
  correct: brand.correct,
  present: brand.present,
  absent: brand.absent,
} as const

/**
 * Tiles shrink to fit the longest mode rather than the card growing: a 7-letter
 * row at the 5-letter tile size would run off the edge.
 */
function tileSize(length: number): number {
  const available = CARD_WIDTH - PADDING * 2
  return Math.min(MAX_TILE, Math.floor((available - TILE_GAP * (length - 1)) / length))
}

export function ShareCard({ input }: { input: CardInput }) {
  const length = input.rows[0]?.marks.length ?? 5
  const side = tileSize(length)
  const headline = cardHeadline(input)

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: PADDING,
        background: brand.bg,
        fontFamily: 'Geist',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div
          style={{
            fontSize: 46,
            fontWeight: 600,
            letterSpacing: '-0.03em',
            color: brand.ink,
          }}
        >
          {headline.product}
        </div>
        <div style={{ fontSize: 40, fontWeight: 400, color: brand.muted }}>{headline.number}</div>
      </div>

      {/*
       * The grid takes all the space between the header and the footer and
       * centres itself in it, so a one-guess card and a six-guess card put
       * their tiles in the same place instead of hanging off the top.
       */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: TILE_GAP,
        }}
      >
        {input.rows.map((row, rowIndex) => (
          <div
            // Two identical rows are legal in a real attempt only across modes,
            // but the index is the row's actual identity here regardless.
            // biome-ignore lint/suspicious/noArrayIndexKey: a row is its position
            key={rowIndex}
            style={{ display: 'flex', gap: TILE_GAP }}
          >
            {row.marks.map((mark, tileIndex) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: a tile is its position
                key={tileIndex}
                style={{
                  width: side,
                  height: side,
                  borderRadius: Math.round(side * TILE_RADIUS_RATIO),
                  background: TILE_COLOURS[mark],
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: brand.onTile,
                  fontSize: Math.round(side * 0.46),
                  fontWeight: 600,
                  lineHeight: 1,
                }}
              >
                {row.word ? (row.word[tileIndex] ?? '').toUpperCase() : ''}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <div style={{ fontSize: 58, fontWeight: 600, color: brand.ink, letterSpacing: '-0.01em' }}>
          {headline.score}
        </div>
        {/*
         * The link line follows the share text's rule: the spoiler-free card
         * carries the room link, because it is an invitation; the letters card
         * carries only the host, because a link on a card that shows the answer
         * would be an invitation aimed at exactly the person it spoils it for.
         */}
        <div style={{ fontSize: 28, fontWeight: 400, color: brand.muted }}>
          {input.withLetters ? input.host : `${input.host}/r/${input.roomCode.toUpperCase()}`}
        </div>
      </div>
    </div>
  )
}
