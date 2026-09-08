import type { ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/cn'

export type BadgeProps = ComponentPropsWithoutRef<'span'>

/**
 * `.hb` — the small accent marker that follows a name, as in the leaderboard's
 * HARD badge. The left margin is part of the badge because it always trails
 * something.
 */
export function Badge({ className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'ml-1.5 inline-block rounded-[4px] bg-accent-soft px-[5px] py-px align-[1px]',
        'text-[10px] font-semibold text-accent',
        className,
      )}
      {...rest}
    />
  )
}
