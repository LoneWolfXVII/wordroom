'use client'

import type { Mark } from '@wordroom/shared'
import { Icon } from '@/components/ui'
import { BackspaceKeyIcon, EnterKeyIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import { BACKSPACE_KEY, ENTER_KEY, KEYBOARD_ROWS, type KeyStates, type KeyValue } from '../keys'

/**
 * `.kb` — the on-screen keyboard.
 *
 * Real buttons, on every device. The spec is explicit that there is no hidden
 * `<input>`: a focused off-screen field is what makes a phone keyboard shove
 * the board off the top of the viewport, and it makes the tab order lie about
 * what is on the page. Desktop typing is a `keydown` listener instead — see
 * `usePhysicalKeyboard`.
 */

const MARK_CLASS: Record<Mark, string> = {
  correct: 'bg-correct text-on-tile',
  present: 'bg-present text-on-tile',
  absent: 'bg-absent text-on-tile',
}

export interface KeyboardProps {
  keyStates: KeyStates
  onKey: (key: KeyValue) => void
  /** Blocks presses while a row is flipping or a request is in the air. */
  disabled?: boolean
}

export function Keyboard({ keyStates, onKey, disabled = false }: KeyboardProps) {
  return (
    <div className="-mx-3.5 flex flex-none flex-col gap-1.5 pt-1.5 pb-2.5">
      {KEYBOARD_ROWS.map((row, index) => (
        <div key={row} className="flex justify-center gap-[5px]">
          {index === 2 ? (
            <Key value={ENTER_KEY} label="Enter" wide onKey={onKey} disabled={disabled}>
              <Icon icon={EnterKeyIcon} size={22} />
            </Key>
          ) : null}

          {[...row].map((letter) => (
            <Key
              key={letter}
              value={letter}
              label={letter}
              mark={keyStates[letter]}
              onKey={onKey}
              disabled={disabled}
            >
              {letter}
            </Key>
          ))}

          {index === 2 ? (
            <Key value={BACKSPACE_KEY} label="Backspace" wide onKey={onKey} disabled={disabled}>
              <Icon icon={BackspaceKeyIcon} size={22} />
            </Key>
          ) : null}
        </div>
      ))}
    </div>
  )
}

interface KeyProps {
  value: KeyValue
  label: string
  mark?: Mark | undefined
  wide?: boolean
  disabled: boolean
  onKey: (key: KeyValue) => void
  children: React.ReactNode
}

/** `.key`. Colour arrives on --d-state; the press itself is faster than that. */
function Key({ value, label, mark, wide = false, disabled, onKey, children }: KeyProps) {
  return (
    <button
      type="button"
      data-key={value}
      aria-label={label}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) onKey(value)
      }}
      className={cn(
        'grid h-[var(--key-height)] place-items-center rounded-sm',
        'text-[15px] font-medium uppercase select-none',
        '[transition:background-color_var(--duration-state)_var(--ease-out),color_var(--duration-state),transform_90ms]',
        'active:translate-y-px active:scale-[0.96] active:bg-key-pressed',
        wide ? 'max-w-[66px] flex-[1.6]' : 'max-w-[42px] flex-1',
        mark ? MARK_CLASS[mark] : 'bg-key text-ink',
      )}
    >
      {children}
    </button>
  )
}
