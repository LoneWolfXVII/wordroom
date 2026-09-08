'use client'

import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import { type ComponentPropsWithoutRef, type ReactNode, useId } from 'react'
import { cn } from '@/lib/cn'

export type RadioGroupProps = ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>

/** Container for `.opt` rows. Arrow keys move between options, as Radix does. */
export function RadioGroup({ className, ...rest }: RadioGroupProps) {
  return <RadioGroupPrimitive.Root className={cn('flex flex-col', className)} {...rest} />
}

export interface RadioOptionProps
  extends Omit<ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>, 'children'> {
  children: ReactNode
  /** `.opt .val` — the muted value pinned to the right of the row. */
  detail?: ReactNode
}

/**
 * `.opt` — an 18px ring whose accent dot springs in on select.
 *
 * The dot is always in the DOM (rather than mounted by Radix's Indicator) so it
 * has something to scale from.
 */
export function RadioOption({ children, detail, className, id, ...rest }: RadioOptionProps) {
  const generatedId = useId()
  const optionId = id ?? generatedId

  return (
    <div className="flex min-h-11 items-center gap-3 py-[10px] pl-[2px] text-sm text-ink-2">
      <RadioGroupPrimitive.Item
        id={optionId}
        className={cn(
          'group grid size-[18px] flex-none place-items-center rounded-full border-[1.5px] border-line-2',
          'transition-colors duration-state',
          'data-[state=checked]:border-accent',
          'disabled:pointer-events-none disabled:opacity-40',
          className,
        )}
        {...rest}
      >
        <span
          aria-hidden
          className="size-2.5 scale-0 rounded-full bg-accent transition-transform duration-state ease-spring group-data-[state=checked]:scale-100"
        />
      </RadioGroupPrimitive.Item>
      <label htmlFor={optionId} className="cursor-pointer">
        {children}
      </label>
      {detail === undefined ? null : (
        <span className="ml-auto text-[13px] text-muted">{detail}</span>
      )}
    </div>
  )
}
