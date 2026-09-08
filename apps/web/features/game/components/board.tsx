'use client'

import { MAX_GUESSES, type MarkRow, type Mode, type ScoredGuess } from '@wordroom/shared'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'
import { bounceDelayMs, flipDelayMs, SHAKE_MS } from '../motion'
import type { BoardPhase } from '../store'
import styles from './board.module.css'
import { Tile } from './tile'

export interface BoardProps {
  mode: Mode
  /** Every scored guess, in order. */
  guesses: readonly ScoredGuess[]
  /** Letters typed into the active row and not yet submitted. */
  current: string
  /** Index of the row that is flipping, or null. */
  revealingRow: number | null
  /** Index of the row that should bounce, or null. */
  bounceRow: number | null
  /** Bumped by the store every time the active row should shake. */
  shakeToken: number
  /** Dim the whole board — a lost puzzle steps back so the word can be read. */
  dimmed: boolean
  phase: BoardPhase
  reduced: boolean
}

/** `.board` — six rows of `mode` tiles, always all six, always the same size. */
export function Board({
  mode,
  guesses,
  current,
  revealingRow,
  bounceRow,
  shakeToken,
  dimmed,
  phase,
  reduced,
}: BoardProps) {
  return (
    <div
      className={cn(
        'grid gap-[var(--size-gap)]',
        phase === 'out' && styles.slideOut,
        phase === 'in' && styles.slideIn,
      )}
    >
      {Array.from({ length: MAX_GUESSES }, (_, index) => {
        const scored = guesses[index]
        const isActive = index === guesses.length
        return (
          <Row
            // Rows are positional: row 3 is row 3 for the life of the puzzle.
            // biome-ignore lint/suspicious/noArrayIndexKey: the board is a fixed grid.
            key={index}
            mode={mode}
            letters={scored?.guess ?? (isActive ? current : '')}
            marks={scored?.marks ?? null}
            flip={index === revealingRow}
            bounce={index === bounceRow}
            shakeToken={isActive ? shakeToken : 0}
            dimmed={dimmed}
            reduced={reduced}
          />
        )
      })}
    </div>
  )
}

interface RowProps {
  mode: Mode
  letters: string
  marks: MarkRow | null
  flip: boolean
  bounce: boolean
  shakeToken: number
  dimmed: boolean
  reduced: boolean
}

function Row({ mode, letters, marks, flip, bounce, shakeToken, dimmed, reduced }: RowProps) {
  const shaking = useShake(shakeToken)

  return (
    <div
      className={cn(
        'grid gap-[var(--size-gap)]',
        'transition-opacity duration-(--duration-struct)',
        dimmed && 'opacity-45',
        shaking && styles.shake,
      )}
      style={{ gridTemplateColumns: `repeat(${mode}, var(--tile-size))` }}
    >
      {Array.from({ length: mode }, (_, index) => (
        <Tile
          // biome-ignore lint/suspicious/noArrayIndexKey: tiles are positional.
          key={index}
          letter={letters[index] ?? ''}
          mark={marks?.[index] ?? null}
          flip={flip}
          bounce={bounce}
          delayMs={bounce ? bounceDelayMs(index, reduced) : flipDelayMs(index, reduced)}
        />
      ))}
    </div>
  )
}

/**
 * Turn a bumped token into a burst of the shake class.
 *
 * The class has to come off again or the next rejection would not re-trigger
 * the animation — restarting a CSS animation means removing and re-adding it.
 */
function useShake(token: number): boolean {
  const [shaking, setShaking] = useState(false)

  useEffect(() => {
    if (token === 0) return
    setShaking(true)
    const timer = setTimeout(() => setShaking(false), SHAKE_MS)
    return () => clearTimeout(timer)
  }, [token])

  return shaking
}
