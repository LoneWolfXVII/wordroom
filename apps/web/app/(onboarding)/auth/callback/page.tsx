import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Screen } from '@/components/ui'
import { AuthCallbackScreen } from '@/features/rooms'

export const metadata: Metadata = { title: 'Signing in · Wordroom', robots: { index: false } }

export default function Page() {
  return (
    <Suspense fallback={<Screen />}>
      <AuthCallbackScreen />
    </Suspense>
  )
}
