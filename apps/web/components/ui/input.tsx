import type { ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/cn'

/**
 * `.input`.
 *
 * The native outline is dropped in favour of the prototype's own focus
 * treatment — accent border plus a 3px accent-soft glow — which is the visible
 * focus state for this control.
 */
export function Input({ className, ...rest }: ComponentPropsWithoutRef<'input'>) {
  return (
    <input
      className={cn(
        'h-[52px] w-full rounded-md border-[1.5px] border-line bg-surface px-[14px] text-[17px]',
        'transition-[border-color,box-shadow] duration-state',
        'focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)] focus:outline-none',
        'disabled:pointer-events-none disabled:opacity-40',
        'aria-invalid:border-danger aria-invalid:focus:border-danger',
        className,
      )}
      {...rest}
    />
  )
}

/** `.field` — label, control and help text as one block. */
export function Field({ className, ...rest }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('mb-4 flex flex-col gap-2', className)} {...rest} />
}

/** `.field label` */
export function Label({ className, ...rest }: ComponentPropsWithoutRef<'label'>) {
  // biome-ignore lint/a11y/noLabelWithoutControl: callers pass htmlFor or wrap the control.
  return <label className={cn('text-[13px] font-medium text-ink-2', className)} {...rest} />
}

export interface HelpProps extends ComponentPropsWithoutRef<'div'> {
  /** `.help` / `.help.ok` / the prototype's inline red for a taken name. */
  tone?: 'default' | 'ok' | 'error'
}

/** `.help` — the line under a field. */
export function Help({ tone = 'default', className, ...rest }: HelpProps) {
  return (
    <div
      className={cn(
        'text-[13px] leading-[1.4]',
        tone === 'ok' && 'text-correct',
        tone === 'error' && 'text-danger',
        tone === 'default' && 'text-muted',
        className,
      )}
      {...rest}
    />
  )
}
