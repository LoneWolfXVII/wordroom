import postgres from 'postgres'

/**
 * A direct connection to Postgres, for the hot path.
 *
 * # Why not supabase-js
 *
 * `serviceClient()` talks to `SUPABASE_URL` — the *public* HTTPS endpoint. So a
 * query from an Edge Function leaves the platform, goes out through Cloudflare
 * to PostgREST, and comes back:
 *
 *     function (ap-south-1) --https--> supabase.co --> PostgREST --> Postgres
 *
 * Each of those costs about what the same call costs from a laptop — ~150ms —
 * because it is the same public endpoint. `submit-guess` makes two, which is
 * most of its ~780ms. The queries themselves take ~11ms: measured by comparing
 * the leaderboard view (joins plus a window function) against a request that
 * touches no database at all.
 *
 * Connecting straight to Postgres removes the HTTPS hop entirely.
 *
 * # The pooler, and why it matters here
 *
 * `SUPABASE_DB_URL` points at the transaction-mode pooler, which is the right
 * thing for Edge Functions: an isolate is short-lived and there may be many at
 * once, so direct connections would exhaust the database's connection limit.
 * Transaction mode also means **no prepared statements** — hence `prepare: false`
 * — and no session state, so nothing may rely on `SET`, advisory locks or
 * temp tables surviving between queries.
 *
 * # Authorisation is unchanged
 *
 * This connects as the service role and therefore bypasses RLS, exactly as
 * `serviceClient()` already did. Every function that uses it still does its own
 * membership check — that has always been the authorisation, because a service
 * role client never had RLS to lean on.
 */

let client: ReturnType<typeof postgres> | null = null

/** One pool per isolate, reused across requests. Created on first use. */
export function sql(): ReturnType<typeof postgres> {
  if (client) return client

  const url = Deno.env.get('SUPABASE_DB_URL')
  if (!url) {
    throw new Error('SUPABASE_DB_URL is not set')
  }

  client = postgres(url, {
    // Transaction pooling cannot hold prepared statements between queries.
    prepare: false,
    // An isolate handles few concurrent requests; a big pool would just hold
    // connections the rest of the platform needs.
    max: 2,
    idle_timeout: 20,
    connect_timeout: 10,
  })

  return client
}

/** True when a direct connection is available; falls back to supabase-js if not. */
export function hasDirectConnection(): boolean {
  return Boolean(Deno.env.get('SUPABASE_DB_URL'))
}
