import { shareLink } from '@/features/game/share'

export interface FourShareInput {
  number: number
  /** Per board, the guess that solved it, or null if it was never solved. */
  solvedAt: readonly (number | null)[]
  points: number
  roomCode: string
  host?: string
}

/** 1-9 as keycap emoji: the digit, a variation selector, the keycap. */
function keycap(n: number): string {
  return `${n}️⃣`
}

/**
 * The spoiler-free Four at once share: the boards as a 2x2 of the guess that
 * solved each, red for one never solved. No letters, so it gives nothing away
 * to a friend who has not played that game yet.
 */
export function fourShareText(input: FourShareInput): string {
  const cell = (n: number | null | undefined) => (n === null || n === undefined ? '🟥' : keycap(n))
  const [a, b, c, d] = input.solvedAt
  const unit = input.points === 1 ? 'pt' : 'pts'
  return [
    `Wordroom Four No. ${input.number} · ${input.points} ${unit}`,
    `${cell(a)}${cell(b)}`,
    `${cell(c)}${cell(d)}`,
    shareLink(input.roomCode, input.host),
  ].join('\n')
}
