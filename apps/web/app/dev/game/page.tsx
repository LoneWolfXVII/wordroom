import type { Metadata } from 'next'
import { DevGame } from '@/features/game/dev/dev-game'

export const metadata: Metadata = { title: 'Game harness · Wordroom' }

/**
 * The game screen against a local double, alongside `/dev/ds`.
 *
 * Thin on purpose: `app/` belongs to workstreams 1 and 3, and the real room
 * route will mount the same `GameScreen` with the real transport.
 */
export default function DevGamePage() {
  return <DevGame />
}
