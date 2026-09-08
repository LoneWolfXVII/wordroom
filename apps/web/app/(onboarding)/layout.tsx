import type { ReactNode } from 'react'
import { RoomsProvider } from '@/features/rooms'

/**
 * Everything that happens before a puzzle: home, create, join, the name lock,
 * the lobby.
 *
 * `RoomsProvider` supplies the query cache and the anonymous session. It sits
 * here rather than in `app/layout.tsx` because that file belongs to workstream 1
 * — but the session is genuinely app-wide, so moving this one line up into the
 * root layout is the right final wiring. Nesting it is safe until then.
 */
export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return <RoomsProvider>{children}</RoomsProvider>
}
