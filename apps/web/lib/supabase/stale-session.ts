/**
 * Dropping a session that belongs to a different Supabase project.
 *
 * `getBrowserClient` pins `storageKey: 'wordroom.auth'` so the session survives
 * a reload. Supabase's own default is `sb-<projectRef>-auth-token`, which the
 * fixed key gives up: when the project changes, the old session is still read
 * back and sent to the new one, which cannot verify a token it did not sign.
 *
 * That happened. Moving production from Tokyo to Mumbai left every player
 * holding a Tokyo access token, and PostgREST answered 401 to every request
 * from then on. It does not recover on its own either — the refresh token is
 * from the wrong project too, so the retry fails the same way. The only way out
 * was to clear site data by hand, which is not something a player will do or
 * should have to.
 *
 * So the session is checked against the project it is about to be used with,
 * and dropped if it does not match. Deliberately narrow: it removes a session
 * that is already useless and leaves every valid one alone. That matters more
 * than it sounds — an anonymous player *is* their session, and discarding a
 * working one would strand the seat and the locked name behind it with no way
 * back in.
 */

/** `https://abc.supabase.co` -> `abc`. Null when the URL is not a project URL. */
export function projectRef(url: string): string | null {
  try {
    const host = new URL(url).hostname
    const [ref, ...rest] = host.split('.')
    // Guard against a self-hosted or proxied URL, where the first label is not
    // a project ref and comparing it would be meaningless.
    if (!ref || rest.join('.') !== 'supabase.co') return null
    return ref
  } catch {
    return null
  }
}

/** The `iss` claim of a JWT, without verifying it. */
function issuerOf(accessToken: string): string | null {
  const payload = accessToken.split('.')[1]
  if (!payload) return null
  try {
    const padded = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), '=')
    const json = atob(padded.replaceAll('-', '+').replaceAll('_', '/'))
    const claims: unknown = JSON.parse(json)
    if (typeof claims !== 'object' || claims === null) return null
    const iss = (claims as { iss?: unknown }).iss
    return typeof iss === 'string' ? iss : null
  } catch {
    // A token this malformed is not one we can keep anyway, but that is for the
    // caller to decide from a null issuer rather than for this to assume.
    return null
  }
}

/**
 * Whether a stored session was issued by `url`'s project.
 *
 * Unknown shapes return true — "not provably foreign". A session that cannot be
 * parsed is left for GoTrue to reject and refresh in its own way; throwing away
 * anything unrecognised would be a far worse failure than the one this fixes.
 */
export function sessionMatchesProject(raw: string, url: string): boolean {
  const ref = projectRef(url)
  if (ref === null) return true

  let token: string | null = null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return true
    // supabase-js has stored the session both bare and wrapped in
    // `currentSession` across versions; read either rather than depend on one.
    const holder = parsed as { access_token?: unknown; currentSession?: { access_token?: unknown } }
    const candidate = holder.access_token ?? holder.currentSession?.access_token
    if (typeof candidate === 'string') token = candidate
  } catch {
    return true
  }
  if (token === null) return true

  const iss = issuerOf(token)
  if (iss === null) return true

  return iss.includes(`//${ref}.`)
}

/**
 * Remove the stored session if it belongs to another project.
 *
 * Runs before the client is constructed, so GoTrue never sees the foreign
 * session and starts clean instead of retrying a token that cannot work.
 * Returns true when something was dropped, which the caller logs — a player
 * being silently signed out deserves a line in the console at least.
 */
export function dropForeignSession(storageKey: string, url: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (raw === null) return false
    if (sessionMatchesProject(raw, url)) return false
    window.localStorage.removeItem(storageKey)
    return true
  } catch {
    // Safari in private mode throws on localStorage. Nothing to drop, and the
    // client below will fail to persist anyway — which is survivable.
    return false
  }
}
