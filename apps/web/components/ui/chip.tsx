import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface ChipProps extends Omit<ComponentPropsWithoutRef<'button'>, 'children'> {
  children: ReactNode
  /** `.chip[aria-pressed=true]` — the accent fill. */
  selected?: boolean
}

/**
 * `.chip` — a preset pill, as used by the timer's 1:00 / 2:00 / 3:00 row.
 *
 * The visible pill stays 32px, as in the prototype, with the hit target pushed
 * to 40px. It deliberately stops short of 44: chips sit 4px below a radio row,
 * and a taller target would overlap that row's own, which trades one problem
 * for a worse one.
 */
export function Chip({ children, selected = false, className, type, ...rest }: ChipProps) {
  return (
    <button
      type={type ?? 'button'}
      aria-pressed={selected}
      className={cn(
        'relative h-8 rounded-full px-3 text-[13px] font-medium',
        // Colour moves on --d-state, the press on --d-micro.
        '[transition:background-color_var(--duration-state),color_var(--duration-state),transform_var(--duration-micro)]',
        'active:scale-[0.95]',
        'disabled:pointer-events-none disabled:opacity-40',
        selected ? 'bg-accent text-on-accent' : 'bg-surface-2 text-ink-2',
        'before:absolute before:inset-x-0 before:-inset-y-1 before:content-[""]',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

/** `.chips` — the wrapping row a set of chips sits in, at the settings indent. */
export function ChipRow({ className, ...rest }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('flex flex-wrap gap-1.5 pt-1 pb-2.5 pl-8', className)} {...rest} />
}
