'use client'

import * as ToggleGroup from '@radix-ui/react-toggle-group'
import { cn } from '@/lib/cn'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[]
  value: T
  onValueChange: (value: T) => void
  /** Names the group for screen readers, e.g. "Word length". */
  label: string
  className?: string
  id?: string
}

/**
 * `.seg` — a pill track with a sliding indicator.
 *
 * The indicator is one absolutely-positioned element sized to `1/n` of the track
 * and moved with `translateX`, so it overshoots on --e-spring exactly as the
 * prototype does rather than resizing.
 *
 * Radix's single-select toggle group gives the correct radiogroup/radio
 * semantics plus arrow-key roving focus, which the prototype's plain buttons
 * did not have.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onValueChange,
  label,
  className,
  id,
}: SegmentedControlProps<T>) {
  const count = options.length
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  )

  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      // Radix emits '' when the pressed item is toggled off; a segmented control
      // always has a selection, so that is ignored.
      onValueChange={(next) => {
        if (next) onValueChange(next as T)
      }}
      aria-label={label}
      id={id}
      className={cn(
        'relative grid w-60 grid-flow-col auto-cols-fr rounded-full bg-surface-2 p-[3px]',
        className,
      )}
    >
      <span
        aria-hidden
        className="absolute top-[3px] bottom-[3px] left-[3px] rounded-full bg-surface shadow-sm transition-transform duration-struct ease-spring"
        style={{
          width: `calc((100% - 6px) / ${count})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          className={cn(
            'relative z-10 h-[30px] rounded-full text-[13px] font-medium',
            'transition-colors duration-state',
            'text-muted data-[state=on]:text-ink',
            // 30px is the prototype's visual height; push the touch target to 44.
            'before:absolute before:inset-x-0 before:-inset-y-[7px] before:content-[""]',
          )}
        >
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}
