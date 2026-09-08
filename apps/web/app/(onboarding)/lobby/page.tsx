import type { Metadata } from 'next'
import { LobbyScreen } from '@/features/rooms'

export const metadata: Metadata = { title: 'Your room · Wordroom' }

export default function Page() {
  return <LobbyScreen />
}
