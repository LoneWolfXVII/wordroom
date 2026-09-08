import type { Metadata } from 'next'
import { LobbyScreen } from '@/features/rooms'

export const metadata: Metadata = { title: 'Your room' }

export default function Page() {
  return <LobbyScreen />
}
