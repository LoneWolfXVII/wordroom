import type { Metadata } from 'next'
import { GameRoute } from '@/features/game-route'

export const metadata: Metadata = { title: 'Wordroom' }

export default function GamePage() {
  return <GameRoute />
}
