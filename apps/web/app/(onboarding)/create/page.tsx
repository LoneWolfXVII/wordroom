import type { Metadata } from 'next'
import { CreateRoomScreen } from '@/features/rooms'

export const metadata: Metadata = { title: 'Create a room · Wordroom' }

export default function Page() {
  return <CreateRoomScreen />
}
