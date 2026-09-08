'use client'

import type { KeyboardEvent, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface StepperProps {
  value: number
  onValueChange: (value: number) => void
  min: number
  max: number
  /** How far one press, or one arrow key, moves the value. */
  step: number
  /** Turns the raw value into what the user reads, e.g. 180 -> "3:00". */
  format?: (value: number) => string
  /** Names the control, e.g. "Time per puzzle". */
  label: string
  /** `.stepper .help` — the line beside the value, e.g. "30s steps, up to 10:00". */
  hint?: ReactNode
  className?: string
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * `.stepper` — minus, value, plus.
 *
 * The value is a `spinbutton`, so Arrow keys, Home and End work and the current
 * value is announced with the text the user actually sees rather than the raw
 * number. The buttons are 36px with the hit target pushed to 44.
 */
export function Stepper({
  value,
  onValueChange,
  min,
  max,
  step,
  format = String,
  label,
  hint,
  className,
}: StepperProps) {
  const set = (next: number) => {
    const clamped = clamp(next, min, max)
    if (clamped !== value) onValueChange(clamped)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number | undefined> = {
      ArrowUp: value + step,
      ArrowRight: value + step,
      ArrowDown: value - step,
      ArrowLeft: value - step,
      Home: min,
      End: max,
    }
    const next = moves[event.key]
    if (next === undefined) return
    event.preventDefault()
    set(next)
  }

  const button = cn(
    'relative grid size-9 flex-none place-items-center rounded-full bg-surface-2 text-[20px] text-ink-2',
    'transition-[background-color,transform] duration-micro active:scale-[0.92]',
    'disabled:pointer-events-none disabled:opacity-40',
    'before:absolute before:-inset-1 before:content-[""]',
  )

  return (
    <div className={cn('flex items-center gap-3.5 pt-1 pb-2.5 pl-8', className)}>
      <button
        type="button"
        className={button}
        aria-label={`Decrease ${label}`}
        disabled={value <= min}
        onClick={() => set(value - step)}
      >
        &minus;
      </button>
      {/* No HTML element gives spinbutton semantics with a custom display format. */}
      <div
        role="spinbutton"
        tabIndex={0}
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={format(value)}
        onKeyDown={handleKeyDown}
        className="tabular min-w-[52px] rounded-sm text-center text-[18px] font-semibold"
      >
        {format(value)}
      </div>
      <button
        type="button"
        className={button}
        aria-label={`Increase ${label}`}
        disabled={value >= max}
        onClick={() => set(value + step)}
      >
        +
      </button>
      {hint === undefined ? null : (
        <span className="text-[13px] leading-[1.4] text-muted">{hint}</span>
      )}
    </div>
  )
}
