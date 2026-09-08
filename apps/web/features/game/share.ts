import { MAX_GUESSES, marksToSquares, type ScoredGuess } from '@wordroom/shared'
import { formatClock } from './timer'

/**
 * Share text, in the two formats the build plan specifies.
 *
 * The formats are matched character for character — a share string is a public
 * artefact that people paste next to each other in a group chat, so the spacing
 * and the separator are part of the product, not a detail.
 */

/** Where a shared link points. The join screen reads the code out of the path. */
export const SHARE_HOST = 'wordroom.nischalgupta.dev'

export interface ShareInput {
  puzzleNumber: number
  /** Every scored guess, in order. */
  guesses: readonly ScoredGuess[]
  solved: boolean
  hardMode: boolean
  /** Time on the puzzle, or null when the timer was off. Off adds no time to the text. */
  elapsedMs: number | null
  roomCode: string
  /** Override for tests and previews. */
  host?: string
}

/**
 * `Wordroom No. 12 · 4/6`, plus `*` for hard mode and ` in 1:38` for the timer.
 *
 * A failed attempt scores `X/6`, the same shorthand every grid in this genre
 * uses. Hard mode's asterisk sits tight against the score; the time is a
 * separate word after it.
 */
export function shareHeadline(input: ShareInput): string {
  const used = input.solved ? String(input.guesses.length) : 'X'
  const hard = input.hardMode ? '*' : ''
  const time = input.elapsedMs === null ? '' : ` in ${formatClock(input.elapsedMs)}`
  return `Wordroom No. ${input.puzzleNumber} · ${used}/${MAX_GUESSES}${hard}${time}`
}

/** `wordroom.nischalgupta.dev/r/KHX7` — opens the join screen with the code filled in. */
export function shareLink(roomCode: string, host: string = SHARE_HOST): string {
  return `${host}/r/${roomCode.toUpperCase()}`
}

/**
 * The default share: colour grid only.
 *
 * Safe to paste in the room chat — it says how the puzzle went without saying a
 * single letter of it.
 */
export function spoilerFreeShare(input: ShareInput): string {
  return [
    shareHeadline(input),
    ...input.guesses.map((row) => marksToSquares(row.marks)),
    shareLink(input.roomCode, input.host),
  ].join('\n')
}

/**
 * The opt-in share: guesses beside their colours.
 *
 * This spoils the puzzle for anyone in the room who has not played it, which is
 * why it sits behind a confirm and carries no room link — a link would invite
 * exactly the person it spoils it for.
 */
export function withLettersShare(input: ShareInput): string {
  return [
    shareHeadline(input),
    ...input.guesses.map((row) => `${spacedLetters(row.guess)}  ${marksToSquares(row.marks)}`),
  ].join('\n')
}

/** `crane` -> `C R A N E`. One space between letters, two before the squares. */
function spacedLetters(word: string): string {
  return word.toUpperCase().split('').join(' ')
}

/** The one line of warning shown before the letters variant can be sent. */
export function lettersShareWarning(puzzleNumber: number): string {
  return `This reveals the answer to anyone in your room who hasn't played No. ${puzzleNumber}.`
}

export type ShareVariant = 'spoiler-free' | 'with-letters'

export function shareText(input: ShareInput, variant: ShareVariant): string {
  return variant === 'with-letters' ? withLettersShare(input) : spoilerFreeShare(input)
}

export type ShareOutcome = 'shared' | 'copied' | 'dismissed' | 'failed'

/**
 * Web Share where the platform has it, clipboard everywhere else.
 *
 * `navigator.share` is the right call on a phone — it opens the OS sheet with
 * the chat apps in it. On a desktop browser that implements it, it opens a menu
 * the user did not ask for, so the caller decides with `preferNativeShare`.
 *
 * A cancelled share sheet rejects with `AbortError`; that is the user saying no,
 * not a failure, and must not fall through to a silent clipboard write.
 */
export async function shareOrCopy(
  text: string,
  options: { preferNativeShare: boolean } = { preferNativeShare: false },
): Promise<ShareOutcome> {
  if (options.preferNativeShare && typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ text })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'dismissed'
      // Anything else (a share the platform refused) falls back to the clipboard.
    }
  }

  try {
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'failed'
  }
}
