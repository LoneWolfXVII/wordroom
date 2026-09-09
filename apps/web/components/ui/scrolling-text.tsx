'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'

/**
 * Text that scrolls itself when it does not fit, and does nothing when it does.
 *
 * The room name sits in the game header next to the puzzle number, and a long
 * one used to run under it: the span carried `truncate` but not `min-w-0`, so
 * its flex parent never let it shrink and the ellipsis never engaged. That is
 * fixed here by construction — the track is `min-w-0` and clipped — but an
 * ellipsis alone means a player in "Teeehehehehehe" only ever sees "Teeehehe…".
 *
 * So when the text overflows it takes a turn: a pause, a slide to the end, a
 * pause there, and back. The edges are masked rather than cut, which is what
 * makes it read as more text continuing rather than as a rendering fault.
 *
 * Nothing animates unless it has to. Overflow is measured, not assumed, and a
 * name that fits gets no mask, no animation and no extra element — the common
 * case stays exactly what it was. Under `prefers-reduced-motion` the global
 * rule in `globals.css` collapses the animation, and the mask alone signals
 * there is more; the title attribute carries the full name either way.
 */
export function ScrollingText({ children, className }: { children: string; className?: string }) {
  const track = useRef<HTMLSpanElement>(null)
  const [overflow, setOverflow] = useState(0)

  useEffect(() => {
    const element = track.current
    if (!element) return

    const measure = () => {
      // `scrollWidth - clientWidth` is exactly how far it has to travel to show
      // the end. Rounded, because sub-pixel text metrics would otherwise report
      // a fraction of a pixel of overflow on a name that plainly fits.
      const distance = Math.round(element.scrollWidth - element.clientWidth)
      setOverflow(distance > 1 ? distance : 0)
    }

    measure()

    // The header is a grid whose columns move as the puzzle number changes
    // width, so this has to be re-measured on resize rather than on mount only.
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const scrolling = overflow > 0

  return (
    <span
      ref={track}
      title={scrolling ? children : undefined}
      className={cn('block min-w-0 overflow-hidden whitespace-nowrap', className)}
      style={
        scrolling
          ? {
              // Both edges: the right is cut at rest, the left once it has
              // travelled. 10px is enough to read as a fade and not as a blur
              // over the first letter.
              maskImage:
                'linear-gradient(to right, transparent 0, #000 10px, #000 calc(100% - 10px), transparent 100%)',
              WebkitMaskImage:
                'linear-gradient(to right, transparent 0, #000 10px, #000 calc(100% - 10px), transparent 100%)',
            }
          : undefined
      }
    >
      <span
        className={cn('inline-block', scrolling && 'wr-marquee')}
        style={
          scrolling
            ? ({
                '--marquee-shift': `-${overflow + 10}px`,
                // Roughly 28px a second, so a name twice too long does not take
                // twice as long per pixel to read.
                '--marquee-duration': `${Math.round((overflow / 28) * 1000) + 3200}ms`,
              } as React.CSSProperties)
            : undefined
        }
      >
        {children}
      </span>
    </span>
  )
}
