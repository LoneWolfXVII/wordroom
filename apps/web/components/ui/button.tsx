import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/cn'
import { Icon } from './icon'
import { SpinnerIcon } from './icons'

/**
 * `.btn` from the prototype.
 *
 * The transition is written out because the three properties do not share a
 * duration there: transform and background move on --d-micro, opacity on
 * --d-state.
 */
export const buttonVariants = cva(
  [
    'inline-flex w-full items-center justify-center gap-2 rounded-md border',
    'font-medium select-none',
    '[transition:transform_var(--duration-micro),background-color_var(--duration-micro),opacity_var(--duration-state)]',
    'active:scale-[0.98]',
    'disabled:pointer-events-none disabled:opacity-40',
    'aria-disabled:pointer-events-none aria-disabled:opacity-40',
  ],
  {
    variants: {
      variant: {
        default: 'border-line bg-surface text-ink',
        primary: 'border-accent bg-accent text-on-accent active:bg-accent-pressed',
        ghost: 'border-transparent bg-transparent text-ink-2 active:bg-surface-2',
        danger: 'border-line bg-surface text-danger',
      },
      size: {
        /** `.btn` — the full-width action at the bottom of a screen. */
        default: 'h-[52px] text-base',
        /** `.btn.ghost` — the quieter third action. */
        md: 'h-11 text-base',
        /** `.btn.sm` — inline, sized to its label. */
        sm: 'h-10 w-auto px-[14px] text-sm',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps
  extends ComponentPropsWithoutRef<'button'>,
    VariantProps<typeof buttonVariants> {
  /** Render the child element instead of a `<button>` — for links that look like buttons. */
  asChild?: boolean
  /** Shows a spinner and blocks input. Keeps the label so the width does not jump. */
  loading?: boolean
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  type,
  ...rest
}: ButtonProps) {
  // `.btn.ghost` is 44px tall in the prototype unless it is also `.sm`.
  const resolvedSize = size ?? (variant === 'ghost' ? 'md' : 'default')
  const classes = cn(buttonVariants({ variant, size: resolvedSize }), className)
  const body = (
    <>
      {loading ? <Icon icon={SpinnerIcon} size={18} className="animate-spin" /> : null}
      {children}
    </>
  )

  // Slot merges onto exactly one child element, so `loading` has no spinner to
  // add here; use a real button when you need one.
  if (asChild) {
    return (
      <Slot className={classes} {...rest}>
        {children}
      </Slot>
    )
  }

  return (
    <button
      type={type ?? 'button'}
      className={classes}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {body}
    </button>
  )
}
