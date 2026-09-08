import { readFileSync } from 'node:fs'
import path from 'node:path'

export interface SupabaseEnv {
  url: string
  anonKey: string
}

const REPO_ROOT = path.resolve(import.meta.dirname, '../..')
const WEB_ENV_FILE = path.join(REPO_ROOT, 'apps/web/.env.local')

/**
 * Parse a dotenv file well enough for two values. Deliberately not a dependency:
 * the file holds credentials and the fewer things that read it the better.
 */
function parseDotEnv(file: string): Record<string, string> {
  let raw: string
  try {
    raw = readFileSync(file, 'utf8')
  } catch {
    return {}
  }

  const out: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '')
    if (value !== '') out[key] = value
  }
  return out
}

let cached: SupabaseEnv | null | undefined

/**
 * The project the suite runs against.
 *
 * `process.env` wins so CI can inject GitHub secrets without writing a file;
 * `apps/web/.env.local` is the local fallback, which is the same file the dev
 * server reads. Neither is ever committed.
 */
export function supabaseEnv(): SupabaseEnv | null {
  if (cached !== undefined) return cached

  const fromFile = parseDotEnv(WEB_ENV_FILE)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? fromFile.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? fromFile.NEXT_PUBLIC_SUPABASE_ANON_KEY

  cached = url && anonKey ? { url: url.replace(/\/$/, ''), anonKey } : null
  return cached
}

/** The suite needs a live project; without one every spec skips rather than fails. */
export function isSupabaseConfigured(): boolean {
  return supabaseEnv() !== null
}

/**
 * The env the suite has, or a thrown error. Call this only from inside a test
 * that has already skipped on `isSupabaseConfigured()`.
 */
export function requireSupabaseEnv(): SupabaseEnv {
  const env = supabaseEnv()
  if (env === null) {
    throw new Error(
      'No Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and ' +
        'NEXT_PUBLIC_SUPABASE_ANON_KEY, or create apps/web/.env.local.',
    )
  }
  return env
}
