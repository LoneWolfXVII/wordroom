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

/** One letter's mark on each of several boards, for a split key. */
export type SplitKeyState = readonly (Mark | null)[]

export interface KeyboardProps {
  keyStates: KeyStates
  onKey: (key: KeyValue) => void
  /** Blocks presses while a row is flipping or a request is in the air. */
  disabled?: boolean
  /**
   * Four at once: each letter key is split into one quarter per board, showing
   * that letter's colour on that board. Replaces `keyStates` for letters.
   */
  splitStates?: Readonly<Record<string, SplitKeyState>> | undefined
}

export function Keyboard({ keyStates, onKey, disabled = false, splitStates }: KeyboardProps) {
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
              mark={splitStates ? undefined : keyStates[letter]}
              split={splitStates ? (splitStates[letter] ?? []) : undefined}
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
  split?: SplitKeyState | undefined
  wide?: boolean
  disabled: boolean
  onKey: (key: KeyValue) => void
  children: React.ReactNode
}

/** `.key`. Colour arrives on --d-state; the press itself is faster than that. */
function Key({ value, label, mark, split, wide = false, disabled, onKey, children }: KeyProps) {
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
        split
          ? 'relative overflow-hidden bg-key text-ink'
          : mark
            ? MARK_CLASS[mark]
            : 'bg-key text-ink',
      )}
    >
      {split ? (
        <span aria-hidden className="absolute inset-0 grid grid-cols-2 grid-rows-2">
          {[0, 1, 2, 3].map((board) => {
            const quarter = split[board] ?? null
            return (
              <span
                key={board}
                data-quarter={quarter ?? 'unknown'}
                className={cn(
                  quarter === 'correct' && 'bg-correct',
                  quarter === 'present' && 'bg-present',
                  quarter === 'absent' && 'bg-absent',
                )}
              />
            )
          })}
        </span>
      ) : null}
      {split ? <span className="relative">{children}</span> : children}
    </button>
  )
}
