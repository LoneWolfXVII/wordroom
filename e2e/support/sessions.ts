import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Browser } from '@playwright/test'
import { ApiUser } from './api'
import { AUTH_STORAGE_KEY, hideDevOverlay } from './app'

/**
 * A small pool of named anonymous accounts, reused everywhere.
 *
 * A live Supabase project caps anonymous sign-ins at a few dozen per hour per
 * IP, and the app signs in on first load — so one browser context is one
 * account, and a suite that hands every test a clean context spends the whole
 * budget in about twenty tests and then fails for reasons that have nothing to
 * do with the app. That is not a hypothetical; it is what happened.
 *
 * So accounts are named (`player`, `friend`) and signed in at most once. What
 * is cached is the exact localStorage value the app wrote, replayed into later
 * contexts before their first navigation, so nothing here needs to know the
 * shape of a Supabase session.
 *
 * The cache is also written to disk, outside git, and reused by later runs:
 * the refresh token in it outlives the access token by a long way, and
 * supabase-js refreshes on load. A developer iterating on these tests therefore
 * spends sign-ins once rather than once per run. Delete the file to start over.
 *
 * Each test still gets a fresh room, and one account may hold a seat in many
 * rooms, so the reuse costs no isolation that matters. Two players who share a
 * room must be different names — that is what the names are for.
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
    // No cache yet, or an unreadable one. Either way, sign in again.
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
 * The out-of-band accounts, cached on the same terms as the browser ones.
 *
 * `fresh: true` forces a new sign-up, which is what to do when an existing
 * account has spent a per-user budget such as create-room's ten per hour.
 */
export async function apiUserFor(role: string, fresh = false): Promise<ApiUser> {
  const key = `api:${role}`

  if (!fresh) {
    const cached = readCache()[key]
    if (cached !== undefined) {
      try {
        const user = ApiUser.fromSession(cached)
        if (!user.isStale || (await user.refresh())) {
          writeCache({ ...readCache(), [key]: user.serialise() })
          return user
        }
      } catch {
        // A cached session that will not load is not worth a failed run.
      }
    }
  }

  const user = await ApiUser.signUp()
  writeCache({ ...readCache(), [key]: user.serialise() })
  return user
}

export class SessionVault {
  private readonly memory = new Map<string, string>()

  async get(role: string, browser: Browser, baseURL: string): Promise<string> {
    const cached = this.memory.get(role)
    if (cached !== undefined) return cached

    const onDisk = readCache()[role]
    if (onDisk !== undefined) {
      this.memory.set(role, onDisk)
      return onDisk
    }

    const value = await this.signIn(role, browser, baseURL)
    this.memory.set(role, value)
    writeCache({ ...readCache(), [role]: value })
    return value
  }

  private async signIn(role: string, browser: Browser, baseURL: string): Promise<string> {
    const context = await browser.newContext()
    const authFailures: string[] = []

    try {
      const page = await context.newPage()
      await hideDevOverlay(page)

      // A rate-limited sign-in is the single most likely reason this suite
      // fails, and a bare timeout hides it. Keep the reason to hand.
      page.on('response', (response) => {
        if (!response.url().includes('/auth/v1/') || response.ok()) return
        authFailures.push(`${response.status()} ${response.url()}`)
      })

      await page.goto(baseURL)
      await page.waitForFunction(
        (key) => window.localStorage.getItem(key as string) !== null,
        AUTH_STORAGE_KEY,
        { timeout: 45_000 },
      )

      const value = await page.evaluate(
        (key) => window.localStorage.getItem(key as string),
        AUTH_STORAGE_KEY,
      )
      if (value === null) throw new Error(`No session stored for role "${role}"`)
      return value
    } catch (error) {
      const detail = authFailures.length
        ? `\nThe auth endpoint refused it: ${authFailures.join(', ')}.` +
          '\nA 429 here is the project’s anonymous sign-in budget for this IP — ' +
          'it refills on the hour, and a cached e2e/.artifacts/sessions.json avoids ' +
          'spending it again.'
        : ''
      throw new Error(`Could not sign in as "${role}".${detail}\n${String(error)}`)
    } finally {
      await context.close()
    }
  }
}
