'use client'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabaseEnv } from './env'
import { dropForeignSession } from './stale-session'

let cached: SupabaseClient | null = null

/**
 * Fixed, not `sb-<ref>-auth-token`. Kept fixed on purpose: deriving it from the
 * project would orphan a *valid* session whenever the ref changed, and for an
 * anonymous player an orphaned session is a seat and a locked name they can
 * never reach again. `dropForeignSession` handles the mismatch case instead,
 * which discards only the sessions that are already unusable.
 */
const STORAGE_KEY = 'wordroom.auth'

/**
 * The browser's Supabase client. One instance per tab.
 *
 * A second instance would open a second GoTrue, and the two would race each
 * other refreshing the same token, so this is memoised rather than constructed
 * per call.
 *
 * The session lives in `localStorage`, which is what lets an anonymous player
 * keep their room and their locked name across a reload. It also means no server
 * component can read the session — see `server.ts`.
 *
 * `flowType: 'pkce'` is required for `linkIdentity`: upgrading an anonymous user
 * to Google has to come back to a code exchange that proves it is the same
 * browser, otherwise the link could be replayed.
 */
export function getBrowserClient(): SupabaseClient {
  if (cached) return cached
  const { url, anonKey } = supabaseEnv()

  // `storageKey` below is fixed rather than derived from the project ref, so a
  // session outlives a change of project and gets replayed at one that cannot
  // verify it — 401 on every request, with no recovery, because the refresh
  // token is from the wrong project too. Moving production from Tokyo to Mumbai
  // did exactly that. Drop such a session before GoTrue ever loads it.
  dropForeignSession(STORAGE_KEY, url)

  cached = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storageKey: STORAGE_KEY,
    },
  })
  return cached
}
