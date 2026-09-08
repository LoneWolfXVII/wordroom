'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { SessionProvider } from './session'

/**
 * One query client per browser, held at module scope.
 *
 * Deliberately a singleton rather than `useState(() => new QueryClient())`: the
 * game and the leaderboard will each want to wrap their own subtree, and a
 * second client would mean a second cache and a second realtime-driven refetch
 * of the same member list. Nesting this provider is a no-op.
 */
let browserQueryClient: QueryClient | null = null

function getQueryClient(): QueryClient {
  browserQueryClient ??= new QueryClient({
    defaultOptions: {
      queries: {
        // Room membership changes through realtime, not through polling.
        refetchOnWindowFocus: false,
        staleTime: 30_000,
        retry: 1,
      },
    },
  })
  return browserQueryClient
}

/**
 * Everything the rooms feature needs in scope: a query cache and a session.
 *
 * **Other workstreams:** wrap your route in this — or ask for it to be added
 * once to `app/layout.tsx` — before calling `useSession`, `useActiveSeat` or
 * rendering `RoomSheet`. It is safe to nest.
 */
export function RoomsProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      <SessionProvider>{children}</SessionProvider>
    </QueryClientProvider>
  )
}
