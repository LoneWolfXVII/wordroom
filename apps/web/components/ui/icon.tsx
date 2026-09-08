import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import type { ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/cn'

/** Default glyph size. The design brief allows 18-20; 20 is the common case. */
export const ICON_SIZE = 20
/** Every stroke in the product is 1.6. */
export const ICON_STROKE = 1.6

export interface IconProps extends Omit<ComponentPropsWithoutRef<'svg'>, 'ref'> {
  /** A named export from `@hugeicons/core-free-icons` — the Stroke Rounded set. */
  icon: IconSvgElement
  /** 18-20 in normal use. */
  size?: number
  strokeWidth?: number
  /**
   * Accessible name. Omit it and the icon is treated as decorative — which is
   * right whenever a visible label or an `aria-label` on the parent already says
   * what the control does.
   */
  label?: string
}

/**
 * The only way icons enter the product. Fixes the size and stroke so no caller
 * has to remember them, and makes the decorative-vs-labelled choice explicit.
 */
export function Icon({
  icon,
  size = ICON_SIZE,
  strokeWidth = ICON_STROKE,
  label,
  className,
  ...rest
}: IconProps) {
  return (
    <HugeiconsIcon
      icon={icon}
      size={size}
      strokeWidth={strokeWidth}
      className={cn('shrink-0', className)}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      {...rest}
    />
  )
}
