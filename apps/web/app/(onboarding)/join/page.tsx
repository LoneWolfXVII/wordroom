import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Screen } from '@/components/ui'
import { JoinRoomScreen } from '@/features/rooms'

export const metadata: Metadata = { title: 'Join a room' }

/**
 * `useSearchParams` opts a route into client rendering, and Next requires the
 * boundary to be explicit. The fallback is the empty screen frame, so the page
 * does not flash a different background before the code boxes land.
 */
export default function Page() {
  return (
    <Suspense fallback={<Screen />}>
      <JoinRoomScreen />
    </Suspense>
  )
}
