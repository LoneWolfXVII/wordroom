'use client'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabaseEnv } from './env'

let cached: SupabaseClient | null = null

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
  cached = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storageKey: 'wordroom.auth',
    },
  })
  return cached
}
