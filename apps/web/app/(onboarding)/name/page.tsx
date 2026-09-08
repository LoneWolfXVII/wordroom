import type { Metadata } from 'next'
import { NameScreen } from '@/features/rooms'

export const metadata: Metadata = { title: 'Pick your name' }

export default function Page() {
  return <NameScreen />
}
