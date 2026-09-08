/**
 * Supabase configuration, read from the environment.
 *
 * Both values are public by design — the anon key is a client credential whose
 * authority comes entirely from RLS, not from being secret. The service role key
 * is never read here and must never reach this package.
 *
 * The lookups are written as literal member access on `process.env` because that
 * is the only form Next inlines into the browser bundle.
 */

export interface SupabaseEnv {
  url: string
  anonKey: string
}

/**
 * Thrown when the app is running without Supabase credentials. Screens catch
 * this and say so plainly rather than failing with a network error that looks
 * like the server is down.
 */
export class SupabaseConfigError extends Error {
  constructor(missing: string[]) {
    super(
      `Supabase is not configured. Missing ${missing.join(' and ')}. ` +
        'Copy .env.example to apps/web/.env.local and fill it in.',
    )
    this.name = 'SupabaseConfigError'
  }
}

function read(): { env: SupabaseEnv | null; missing: string[] } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const missing: string[] = []
  if (!url) missing.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!anonKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY')

  if (!url || !anonKey) return { env: null, missing }
  return { env: { url, anonKey }, missing }
}

/** True when both public values are present. Never throws, so a render may ask. */
export function isSupabaseConfigured(): boolean {
  return read().env !== null
}

/**
 * The configuration, or a `SupabaseConfigError`.
 *
 * Call this from an effect, an event handler or a query function — never during
 * render, or `next build` fails on a machine that has no `.env.local`.
 */
export function supabaseEnv(): SupabaseEnv {
  const { env, missing } = read()
  if (!env) throw new SupabaseConfigError(missing)
  return env
}
