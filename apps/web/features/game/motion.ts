/**
 * Reveal choreography, in numbers.
 *
 * These mirror the durations in board.module.css and the motion budget in
 * CLAUDE.md: 120ms micro, 200ms state, 350ms structural, 600ms reveal, nothing
 * over 600ms. They live in TypeScript as well as CSS because the JavaScript has
 * to know when an animation has landed in order to open the result sheet after
 * it, not during it.
 *
 * Every function takes `reduced`. With motion reduced globals.css collapses the
 * CSS side to nothing, so the JavaScript side has to collapse too — otherwise
 * the board would sit finished and silent for a second before the sheet
 * appeared.
 */

/** `--d-reveal`. One tile's flip. */
export const REVEAL_MS = 600
/** The gap between one tile starting its flip and the next. */
export const STAGGER_MS = 70
/** A key takes its colour as its tile lands, not when the row finishes. */
export const KEY_COLOUR_MS = 400
/** `--d-struct`. Board swap, sheet, odometer. */
export const STRUCT_MS = 350
/** The shake on a rejected row. */
export const SHAKE_MS = 300
/** One tile's bounce on a solve, and the gap between tiles. */
export const BOUNCE_MS = 500
export const BOUNCE_STAGGER_MS = 90
/** How long the celebration runs before the result sheet arrives over it. */
export const SOLVE_SETTLE_MS = 420
/** A loss has no celebration — just long enough to read the revealed word. */
export const FAIL_SETTLE_MS = 700

/**
 * Whether the viewer has asked for less motion.
 *
 * Components use Motion's `useReducedMotion`; this is for the store, which has
 * no hooks but still has to know not to hold a board-swap open for 350ms of
 * animation that will not play.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Resolve after `ms`, so a board swap is never cut short by a fast response. */
export function wait(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** When tile `index` starts its flip. */
export function flipDelayMs(index: number, reduced: boolean): number {
  return reduced ? 0 : index * STAGGER_MS
}

/** When the whole row has finished flipping. */
export function rowRevealMs(length: number, reduced: boolean): number {
  if (reduced) return 0
  return Math.max(0, length - 1) * STAGGER_MS + REVEAL_MS
}

/** When key `index` should take its colour. */
export function keyColourMs(index: number, reduced: boolean): number {
  return reduced ? 0 : index * STAGGER_MS + KEY_COLOUR_MS
}

/** When tile `index` starts its bounce. */
export function bounceDelayMs(index: number, reduced: boolean): number {
  return reduced ? 0 : index * BOUNCE_STAGGER_MS
}

/** How long after the reveal lands the result sheet opens. */
export function settleMs(length: number, solved: boolean, reduced: boolean): number {
  if (reduced) return 0
  if (!solved) return FAIL_SETTLE_MS
  return SOLVE_SETTLE_MS + Math.max(0, length - 1) * BOUNCE_STAGGER_MS
}
