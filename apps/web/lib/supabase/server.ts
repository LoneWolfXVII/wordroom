import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabaseEnv } from './env'

/**
 * A Supabase client for server code — route handlers, server components, the OG
 * image endpoint.
 *
 * **This client is not signed in, and cannot be.** The browser keeps its session
 * in `localStorage`, which no request carries, so there is no cookie for the
 * server to read. Under RLS that leaves it with `anon`'s privileges, and `anon`
 * has no grant on `rooms`, `players`, `puzzles` or `attempts` — every table this
 * product cares about. So: use it for genuinely public reads only, and do the
 * authenticated work in the browser or in an Edge Function, which is where the
 * bearer token actually is.
 *
 * Switching to cookie-backed sessions later means adding `@supabase/ssr` and
 * replacing this file; it is deliberately small so that stays cheap.
 *
 * Never construct a service-role client here. This package is bundled for the
 * browser and the key would be one import away from shipping.
 */
export function getServerClient(): SupabaseClient {
  const { url, anonKey } = supabaseEnv()
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}
