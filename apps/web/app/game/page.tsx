import type { Metadata } from 'next'
import { GameRoute } from '@/features/game-route'

// `absolute` opts out of the root template; the game screen is the app, and
// "Wordroom · Wordroom" is what the template would otherwise produce.
export const metadata: Metadata = { title: { absolute: 'Wordroom' } }

export default function GamePage() {
  return <GameRoute />
}
