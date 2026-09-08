'use client'

import * as SwitchPrimitive from '@radix-ui/react-switch'
import type { ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/cn'

export type SwitchProps = ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>

/**
 * `.sw` — 44x26 track, 20px thumb, spring on the throw.
 *
 * The track is wrapped in a 44px-tall row so the touch target is square even
 * though the track itself is 26px.
 */
export function Switch({ className, ...rest }: SwitchProps) {
  return (
    <span className="flex h-11 flex-none items-center">
      <SwitchPrimitive.Root
        className={cn(
          'relative h-[26px] w-11 rounded-full bg-line-2',
          'transition-colors duration-state',
          'data-[state=checked]:bg-accent',
          'disabled:pointer-events-none disabled:opacity-40',
          className,
        )}
        {...rest}
      >
        <SwitchPrimitive.Thumb
          className={cn(
            'block size-5 translate-x-[3px] rounded-full bg-white',
            'shadow-[0_1px_3px_rgba(0,0,0,0.2)]',
            'transition-transform duration-state ease-spring',
            'data-[state=checked]:translate-x-[21px]',
          )}
        />
      </SwitchPrimitive.Root>
    </span>
  )
}
