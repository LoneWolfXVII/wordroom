import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ApiUser } from './api'

/**
 * A small pool of named anonymous accounts, reused everywhere.
 *
 * **The constraint this exists for.** A live Supabase project allows 30
 * anonymous sign-ins per hour per IP — measured, not guessed: the 31st returns
 * `429 over_request_rate_limit`. The app signs in on first load, so one browser
 * context is one account, and a suite that hands every test a clean context
 * spends the whole budget in about twenty tests and then fails for reasons that
 * have nothing to do with the app. That is not hypothetical; it is what
 * happened, twice, before this file existed.
 *
 * So there are four accounts and no more:
 *
 * | role     | who                                                        |
 * | -------- | ---------------------------------------------------------- |
 * | `player` | the browser player in every single-player spec              |
 * | `friend` | the second browser, for the create→join flow                |
 * | `host`   | out of band: creates rooms, plays No. 1 to learn the answer |
 * | `rival`  | out of band: a *second* player who has solved that puzzle   |
 *
 * Each is minted once and cached in `e2e/.cache/sessions.json`, outside git and
 * outside Playwright's output directory — which it empties at the start of
 * every run. Later runs therefore cost nothing; `e2e/scripts/warm-sessions.mjs`
 * fills the cache ahead of time when the budget is tight.
 *
 * A session is minted straight from `/auth/v1/signup` and replayed into
 * localStorage before the first navigation. That is sound because the response
 * body *is* what supabase-js persists — same six fields, verified against a
 * value the app itself wrote — so the browser finds a session and never signs
 * in again.
 *
 * Tests stay isolated where it matters: every test gets a fresh room, and one
 * account may hold a seat in many rooms. The rule the roles encode is that two
 * players in the same room must be different accounts.
 */

// Not `.artifacts`: Playwright empties its outputDir at the start of every run,
// which would throw the cache away exactly when it is most useful.
const CACHE_DIR = path.resolve(import.meta.dirname, '../.cache')
const CACHE_FILE = path.join(CACHE_DIR, 'sessions.json')

type Cache = Record<string, string>

function readCache(): Cache {
  try {
    const parsed: unknown = JSON.parse(readFileSync(CACHE_FILE, 'utf8'))
    if (parsed !== null && typeof parsed === 'object') return parsed as Cache
  } catch {
    // No cache yet, or an unreadable one. Either way, mint a new session.
  }
  return {}
}

function writeCache(cache: Cache): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true })
    writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2))
  } catch {
    // A cache that cannot be written costs sign-ins, not correctness.
  }
}

/**
 * The account for `role`, from the cache when possible.
 *
 * `fresh: true` forces a new sign-up, which is what to do when an existing
 * account has spent a per-user budget such as create-room's ten per hour.
 */
export async function accountFor(role: string, fresh = false): Promise<ApiUser> {
  if (!fresh) {
    const cached = readCache()[role]
    if (cached !== undefined) {
      try {
        const user = ApiUser.fromSession(cached)
        // The access token lasts an hour; the refresh token far longer, which
        // is what makes a cache worth keeping between runs.
        if (!user.isStale || (await user.refresh())) {
          writeCache({ ...readCache(), [role]: user.serialise() })
          return user
        }
      } catch {
        // A cached session that will not load is not worth a failed run.
      }
    }
  }

  const user = await ApiUser.signUp()
  writeCache({ ...readCache(), [role]: user.serialise() })
  return user
}

/** The same account, as the string the browser keeps in localStorage. */
export async function sessionFor(role: string): Promise<string> {
  const user = await accountFor(role)
  return user.serialise()
}
