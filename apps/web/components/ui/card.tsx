import type { ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/cn'

/** `.card` — surface, hairline, 18px radius, one step of elevation. */
export function Card({ className, ...rest }: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn('rounded-lg border border-line bg-surface p-5 shadow-sm', className)}
      {...rest}
    />
  )
}

/** `.card .k` — the small centred caption above a card's payload. */
export function CardLabel({ className, ...rest }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('mb-3 text-center text-[13px] text-muted', className)} {...rest} />
}
