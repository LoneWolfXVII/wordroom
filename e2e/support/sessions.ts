import type { Browser } from '@playwright/test'
import { AUTH_STORAGE_KEY, hideDevOverlay } from './app'

/**
 * A small pool of anonymous accounts, reused across a worker's tests.
 *
 * A live Supabase project caps anonymous sign-ins at a few dozen per hour per
 * IP. The app signs in on first load, so one browser context is one account,
 * and a suite that hands every test a clean context spends the whole budget in
 * about twenty tests and then fails for a reason that has nothing to do with
 * the app.
 *
 * So accounts are named — `player`, `friend` — and a name is signed in once per
 * worker. What is cached is the exact localStorage value the app wrote, replayed
 * into later contexts before their first navigation, so nothing here has to know
 * the shape of a Supabase session.
 *
 * Each test still gets a fresh room, and one account may hold a seat in many
 * rooms, so reuse costs no isolation that matters. Two accounts must never
 * share a room under different names — that is what the names are for.
 */
export class SessionVault {
  private readonly sessions = new Map<string, string>()

  async get(role: string, browser: Browser, baseURL: string): Promise<string> {
    const cached = this.sessions.get(role)
    if (cached !== undefined) return cached

    const context = await browser.newContext()
    try {
      const page = await context.newPage()
      await hideDevOverlay(page)
      await page.goto(baseURL)

      // `SessionProvider` calls signInAnonymously on mount; wait for what it
      // stored rather than for a spinner to stop.
      await page.waitForFunction(
        (key) => window.localStorage.getItem(key as string) !== null,
        AUTH_STORAGE_KEY,
        { timeout: 60_000 },
      )
      const value = await page.evaluate(
        (key) => window.localStorage.getItem(key as string),
        AUTH_STORAGE_KEY,
      )
      if (value === null) throw new Error(`No session stored for role "${role}"`)

      this.sessions.set(role, value)
      return value
    } finally {
      await context.close()
    }
  }
}
