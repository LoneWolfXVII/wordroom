'use client'

import { CODE_ALPHABET, CODE_LENGTH } from '@wordroom/shared'
import { type ClipboardEvent, type KeyboardEvent, useEffect, useRef } from 'react'
import { cn } from '@/lib/cn'

const boxBase = [
  'rounded-md border-[1.5px] border-line bg-surface text-center font-semibold uppercase',
  'transition-[border-color,transform] duration-state',
]

function sanitise(raw: string, alphabet: string): string {
  const allowed = new Set(alphabet.split(''))
  return raw
    .toUpperCase()
    .split('')
    .filter((character) => allowed.has(character))
    .join('')
}

export interface CodeBoxesProps {
  /** Current code, uppercase, at most `length` characters. */
  value: string
  onValueChange: (value: string) => void
  length?: number
  /** Characters a box will accept. Defaults to the room-code alphabet. */
  alphabet?: string
  /** Names the group, e.g. "Room code". */
  label: string
  disabled?: boolean
  invalid?: boolean
  autoFocus?: boolean
  className?: string
}

/**
 * `.codebox` — one input per character.
 *
 * Typing advances, Backspace on an empty box steps back and clears, and a paste
 * of a whole code fills the row. Everything is filtered through the room-code
 * alphabet so an unusable character never appears.
 */
export function CodeBoxes({
  value,
  onValueChange,
  length = CODE_LENGTH,
  alphabet = CODE_ALPHABET,
  label,
  disabled = false,
  invalid = false,
  autoFocus = false,
  className,
}: CodeBoxesProps) {
  const boxes = useRef<(HTMLInputElement | null)[]>([])

  // Focused after mount rather than with the `autofocus` attribute, which the
  // server would render and which steals focus before hydration.
  useEffect(() => {
    if (autoFocus) boxes.current[0]?.focus()
  }, [autoFocus])

  // A gap is held as a space so later characters keep their position; nothing
  // outside this component ever sees one.
  const charAt = (index: number) => (value[index] ?? '').trim()

  const focusBox = (index: number) => {
    boxes.current[Math.min(Math.max(index, 0), length - 1)]?.focus()
  }

  const setCharacter = (index: number, character: string) => {
    const next = value.padEnd(length, ' ').split('')
    next[index] = character || ' '
    onValueChange(next.join('').trimEnd())
  }

  const handleInput = (index: number, raw: string) => {
    const cleaned = sanitise(raw, alphabet)
    if (!cleaned) {
      setCharacter(index, '')
      return
    }
    // A soft keyboard can deliver more than one character at a time.
    const chars = cleaned.split('')
    const next = value.padEnd(length, ' ').split('')
    chars.forEach((character, offset) => {
      if (index + offset < length) next[index + offset] = character
    })
    onValueChange(next.join('').trimEnd())
    focusBox(index + chars.length)
  }

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !charAt(index)) {
      event.preventDefault()
      setCharacter(index - 1, '')
      focusBox(index - 1)
      return
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      focusBox(index - 1)
      return
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      focusBox(index + 1)
    }
  }

  const handlePaste = (index: number, event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault()
    const pasted = sanitise(event.clipboardData.getData('text') ?? '', alphabet).slice(
      0,
      length - index,
    )
    if (!pasted) return
    const next = value.padEnd(length, ' ').split('')
    pasted.split('').forEach((character, offset) => {
      next[index + offset] = character
    })
    onValueChange(next.join('').trimEnd())
    focusBox(index + pasted.length)
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: a group of inputs, not a list.
    <div role="group" aria-label={label} className={cn('flex justify-center gap-2', className)}>
      {Array.from({ length }, (_, index) => {
        const character = charAt(index)
        return (
          <input
            // biome-ignore lint/suspicious/noArrayIndexKey: positional by definition.
            key={index}
            ref={(element) => {
              boxes.current[index] = element
            }}
            value={character}
            onChange={(event) => handleInput(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onPaste={(event) => handlePaste(index, event)}
            onFocus={(event) => event.target.select()}
            disabled={disabled}
            inputMode="text"
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            aria-label={`${label}, character ${index + 1} of ${length}`}
            aria-invalid={invalid || undefined}
            className={cn(
              boxBase,
              'h-16 w-14 text-[28px]',
              'focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)] focus:outline-none',
              'disabled:pointer-events-none disabled:opacity-40',
              character && 'animate-pop border-line-2',
              invalid && 'border-danger',
            )}
          />
        )
      })}
    </div>
  )
}

export interface CodeDisplayProps {
  /** The code to show. Read-only by construction. */
  code: string
  label?: string
  className?: string
}

/**
 * `.codebox.big` — the lobby's read-only presentation of a room code. Not an
 * input: there is nothing here to type into.
 */
export function CodeDisplay({ code, label = 'Room code', className }: CodeDisplayProps) {
  return (
    <div
      className={cn('flex justify-center gap-2', className)}
      aria-label={`${label} ${code.split('').join(' ')}`}
      role="img"
    >
      {code.split('').map((character, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: positional by definition.
          key={index}
          aria-hidden
          className={cn(boxBase, 'grid h-[76px] w-16 place-items-center text-[34px] tabular')}
        >
          {character}
        </div>
      ))}
    </div>
  )
}
