'use client'

import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { STRUCT_MS } from '../motion'

/** `--e-out`, as a cubic-bezier array for Motion. */
const EASE_OUT = [0.2, 0.8, 0.2, 1] as const

export interface PuzzleNumberProps {
  number: number
}

/**
 * `.no .n` — the odometer on the puzzle counter.
 *
 * The old number rolls up out of a clipped box and the new one rolls in from
 * below, which is the one place in the product where a number changing is worth
 * animating: it is the thing players compare with each other, so it should be
 * clear it moved. `popLayout` takes the outgoing digit out of flow, so the two
 * share the slot instead of sitting side by side.
 *
 * "No." does not move. Only the number does.
 */
export function PuzzleNumber({ number }: PuzzleNumberProps) {
  const reduced = useReducedMotion() ?? false

  return (
    <div className="text-center leading-none">
      <div className="inline-flex h-[26px] items-start overflow-hidden align-bottom text-[length:var(--number-size)] font-semibold tracking-[-0.02em]">
        <span>No.&nbsp;</span>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={number}
            className="tabular"
            initial={{ y: '110%' }}
            animate={{ y: 0 }}
            exit={{ y: '-110%' }}
            transition={{ duration: reduced ? 0 : STRUCT_MS / 1000, ease: EASE_OUT }}
          >
            {number}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  )
}
