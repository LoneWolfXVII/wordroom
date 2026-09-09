import type { Metadata } from 'next'
import { Suspense } from 'react'
import { ScreenFallback } from '@/components/ui'
import { AuthCallbackScreen } from '@/features/rooms'

export const metadata: Metadata = { title: 'Signing in', robots: { index: false } }

export default function Page() {
  return (
    <Suspense fallback={<ScreenFallback />}>
      <AuthCallbackScreen />
    </Suspense>
  )
}
