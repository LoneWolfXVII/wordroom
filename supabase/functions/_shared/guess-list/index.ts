/**
 * Server-side spelling check.
 *
 * The browser also checks the guess against its own copy of this list, but that
 * check is a courtesy — it makes the shake instant. This one is the authority.
 * Without it a player could spend guesses on strings like 'aeiou' or 'sssss',
 * which are worth more information per guess than any real word, and the six
 * guess budget would stop meaning what it means for everyone else.
 *
 * This list is NOT a secret. It is the guess dictionary, the same words the
 * client already has. Answers live in `word_bank`, which no client may read.
 *
 * Regenerate with `deno task build:guesses` after changing the word lists.
 */

import type { Mode } from '@wordroom/shared'
import words5 from './words-5.ts'
import words6 from './words-6.ts'
import words7 from './words-7.ts'

const SOURCES: Record<Mode, string> = { 5: words5, 6: words6, 7: words7 }

const cache = new Map<Mode, Set<string>>()

/** Built on first use per mode, then reused for the life of the isolate. */
export function guessSet(mode: Mode): Set<string> {
  const cached = cache.get(mode)
  if (cached) return cached

  const built = new Set(SOURCES[mode].split('\n'))
  cache.set(mode, built)
  return built
}

export function isRealWord(word: string, mode: Mode): boolean {
  const candidate = word.trim().toLowerCase()
  if (candidate.length !== mode) return false
  return guessSet(mode).has(candidate)
}

export function guessCount(mode: Mode): number {
  return guessSet(mode).size
}
