import type { IconSvgElement } from '@hugeicons/react'
import type { ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/cn'
import { Icon } from './icon'

export interface IconButtonProps extends Omit<ComponentPropsWithoutRef<'button'>, 'children'> {
  icon: IconSvgElement
  /** Required: the control has no visible text, so this is its accessible name. */
  label: string
  /** `.ib.has` — the accent dot that says there is something new behind this button. */
  notification?: boolean
  iconSize?: number
}

/**
 * `.ib` from the prototype: a 40px square icon control.
 *
 * The visible square stays 40px so the header spacing matches the prototype, but
 * a transparent ::before pushes the hit target out to 44px.
 */
export function IconButton({
  icon,
  label,
  notification = false,
  iconSize = 20,
  className,
  type,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      aria-label={label}
      className={cn(
        'relative grid size-10 place-items-center rounded-md text-ink-2',
        'transition-[background-color,transform] duration-micro',
        'active:scale-[0.92] active:bg-surface-2',
        'disabled:pointer-events-none disabled:opacity-40',
        'before:absolute before:-inset-0.5 before:content-[""]',
        className,
      )}
      {...rest}
    >
      <Icon icon={icon} size={iconSize} />
      <span
        aria-hidden
        className={cn(
          'absolute top-2 right-2 size-[7px] rounded-full bg-accent',
          'transition-transform duration-state ease-spring',
          notification ? 'scale-100' : 'scale-0',
        )}
      />
    </button>
  )
}
