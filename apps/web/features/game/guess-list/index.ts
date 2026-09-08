import type { Mode } from '@wordroom/shared'

/**
 * Client-side spelling check.
 *
 * This is a courtesy, not the authority: it makes the shake instant and saves a
 * round trip on a typo. `submit-guess` runs the same check server-side and is
 * what actually decides, because a client check can be bypassed and the
 * six-guess budget has to mean the same thing for everyone.
 *
 * The lists are ~50-185KB each, so they load through a dynamic import and never
 * enter the initial bundle. Call `preloadGuessList()` when the board mounts and
 * the words are in memory long before the first Enter.
 */

const cache = new Map<Mode, Set<string>>()
const inFlight = new Map<Mode, Promise<Set<string>>>()

async function fetchList(mode: Mode): Promise<Set<string>> {
  // Static specifiers, one per mode: a bundler cannot split a template literal
  // import into three chunks, and would inline all three lists into one.
  const loaded =
    mode === 5
      ? await import('./words-5')
      : mode === 6
        ? await import('./words-6')
        : await import('./words-7')

  return new Set(loaded.default.split('\n'))
}

/** Load and cache the guess list for a mode. Safe to call repeatedly. */
export function loadGuessList(mode: Mode): Promise<Set<string>> {
  const ready = cache.get(mode)
  if (ready) return Promise.resolve(ready)

  const pending = inFlight.get(mode)
  if (pending) return pending

  const request = fetchList(mode).then((words) => {
    cache.set(mode, words)
    inFlight.delete(mode)
    return words
  })
  inFlight.set(mode, request)
  return request
}

/** Warm the cache without waiting for it. */
export function preloadGuessList(mode: Mode): void {
  void loadGuessList(mode).catch(() => {
    // A failed preload is not fatal: the server check still runs.
  })
}

/**
 * Synchronous spelling check.
 *
 * Returns `undefined` — "don't know yet" — when the list for that mode has not
 * finished loading. Callers must treat that as "let the server decide" rather
 * than as a rejection, or a slow connection would make every early guess look
 * like a typo.
 */
export function isKnownWord(word: string, mode: Mode): boolean | undefined {
  const words = cache.get(mode)
  if (!words) return undefined
  return words.has(word.toLowerCase())
}

/** True once `isKnownWord` can answer for this mode. */
export function isGuessListReady(mode: Mode): boolean {
  return cache.has(mode)
}
