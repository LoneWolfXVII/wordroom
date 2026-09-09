import type { Metadata } from 'next'
import { Suspense } from 'react'
import { ScreenFallback } from '@/components/ui'
import { JoinRoomScreen } from '@/features/rooms'

export const metadata: Metadata = { title: 'Join a room' }

/**
 * `useSearchParams` opts a route into client rendering, and Next requires the
 * boundary to be explicit. The fallback keeps the screen's shape rather than
 * showing an empty frame, so nothing jumps when the real screen lands.
 */
export default function Page() {
  return (
    <Suspense fallback={<ScreenFallback />}>
      <JoinRoomScreen />
    </Suspense>
  )
}
