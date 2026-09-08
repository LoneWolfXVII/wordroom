'use client'

import type { PlayerStats } from '@wordroom/shared'
import { motion, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/cn'
import { distributionBars } from './distribution'

/** --d-struct, staggered so the six bars read as one gesture and end under 600ms. */
const BAR_SECONDS = 0.35
const STAGGER_SECONDS = 0.04
const EASE_OUT = [0.2, 0.8, 0.2, 1] as const

export interface GuessDistributionProps {
  stats: PlayerStats
  /**
   * Guess count of the puzzle just solved. That row is drawn in --correct; the
   * rest are --surface-2. Null outside a result, when nothing is highlighted.
   */
  highlightGuesses?: number | null
}

/**
 * Six horizontal bars, count at the bar end, widths animating in on open.
 *
 * The counts come from `computeStats()` in `@wordroom/shared` — this component
 * never counts anything itself.
 */
export function GuessDistribution({ stats, highlightGuesses = null }: GuessDistributionProps) {
  const reduced = useReducedMotion()
  const bars = distributionBars(stats, highlightGuesses)

  return (
    <div className="flex flex-col gap-1.5">
      {bars.map((bar, index) => (
        <div key={bar.guesses} className="flex items-center gap-2">
          <span className="tabular w-3 flex-none text-[13px] text-muted">{bar.guesses}</span>
          <div className="min-w-0 flex-1">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${bar.percent}%` }}
              transition={{
                duration: reduced ? 0 : BAR_SECONDS,
                delay: reduced ? 0 : index * STAGGER_SECONDS,
                ease: EASE_OUT,
              }}
              className={cn(
                'flex h-5 min-w-6 items-center justify-end rounded-sm px-1.5',
                'tabular text-[12px] font-semibold',
                bar.highlighted ? 'bg-correct text-on-tile' : 'bg-surface-2 text-ink-2',
              )}
            >
              {bar.count}
              <span className="sr-only">
                {` solved in ${bar.guesses} ${bar.guesses === 1 ? 'guess' : 'guesses'}`}
              </span>
            </motion.div>
          </div>
        </div>
      ))}
    </div>
  )
}
