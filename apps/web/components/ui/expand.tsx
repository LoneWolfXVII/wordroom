import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface ExpandProps {
  open: boolean
  children: ReactNode
  /**
   * The height the section opens to. It is a `max-height`, so the content is
   * never stretched — but it must be at least as tall as the content or the
   * bottom is clipped. The prototype uses 320.
   */
  maxHeight?: number
  className?: string
}

/**
 * `.expand` — a section that slides open under its switch.
 *
 * While closed the content stays in the DOM but is `inert`, so it is out of the
 * tab order and hidden from screen readers rather than being invisible but
 * still reachable.
 */
export function Expand({ open, children, maxHeight = 320, className }: ExpandProps) {
  return (
    <div
      className={cn('overflow-hidden transition-[max-height] duration-struct ease-out', className)}
      style={{ maxHeight: open ? maxHeight : 0 }}
      inert={!open}
    >
      {children}
    </div>
  )
}
