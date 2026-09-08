import type { Page } from '@playwright/test'
import { createRoom, startPlaying, uniqueName, waitForPlayable, warmRoutes } from './support/app'
import { expect, requiresSupabase, test, testRoomName } from './support/fixtures'

requiresSupabase()

/**
 * Handing the tab to Google is the one action in the app with no completion to
 * wait for. Every other button ends in a response; this one ends in the browser
 * leaving. So the panel sets a pending state that nothing on this page will
 * ever clear — and if the player comes back without finishing, they used to
 * find a spinner over a dead button, with the email link behind it disabled
 * too. The trip was over; the panel was still waiting for it.
 *
 * Both tests below abandon the trip on purpose, and stay on the page while they
 * do it - the state a player is in with Google's account picker in front of
 * them, before they dismiss it.
 */

/**
 * Stop the hand-off to Google without stopping the click that starts it.
 *
 * `route.abort()` is not enough: a blocked top level navigation still commits
 * an error page, and the panel under test goes with it. A `204 No Content`
 * does what is needed instead - the browser has nothing to render, so it stays
 * exactly where it is, on a live page whose sign-in is mid-flight. That is the
 * state a player is in while Google's account picker is up, and the state they
 * are still in after dismissing it.
 */
async function abandonTheTripToGoogle(page: Page): Promise<void> {
  await page.route('https://accounts.google.com/**', (route) =>
    route.fulfill({ status: 204, body: '' }),
  )
}

async function openAccountPanel(page: Page): Promise<void> {
  const settings = page.getByRole('button', { name: 'Settings' })
  if (await settings.isVisible()) await settings.click()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeEnabled()
}

test.describe('coming back from an abandoned Google sign-in', () => {
  test.beforeEach(async ({ page }) => {
    await warmRoutes(page)
    await createRoom(page, testRoomName('signin'), uniqueName('Host'))
    await startPlaying(page)
    await waitForPlayable(page)
  })

  test('coming back to the tab gives the button back', async ({ page }) => {
    await abandonTheTripToGoogle(page)
    await openAccountPanel(page)

    const google = page.getByRole('button', { name: 'Continue with Google' })
    await google.click()

    // The stuck state, reproduced: waiting on a trip that is already over.
    await expect(google).toHaveAttribute('aria-busy', 'true')
    await expect(google).toBeDisabled()

    // Returning to the tab is the app's only evidence that the player is here
    // rather than at Google. Headless Chromium will not actually background a
    // page - `bringToFront` fires nothing - so the event is dispatched
    // directly. What is under test is the listener and what it does to the
    // panel, and both are real.
    await page.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await expect(google).toBeEnabled()
    await expect(google).not.toHaveAttribute('aria-busy', 'true')

    // The email link was disabled behind the spinner; it is the way out the
    // player was actually reaching for.
    await page.getByRole('button', { name: 'Use an email link instead' }).click()
    await expect(page.getByLabel('Email address')).toBeEnabled()
  })

  test('"Not now" hands back a panel that is not still waiting', async ({ page }) => {
    await abandonTheTripToGoogle(page)
    await openAccountPanel(page)

    await page.getByRole('button', { name: 'Continue with Google' }).click()
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toHaveAttribute(
      'aria-busy',
      'true',
    )

    // The panel stays mounted while collapsed, so without a reset "Not now"
    // only hides the spinner and puts it straight back on the next "Sign in".
    await page.getByRole('button', { name: 'Not now' }).click()
    await page.getByRole('button', { name: 'Sign in' }).click()

    const google = page.getByRole('button', { name: 'Continue with Google' })
    await expect(google).toBeEnabled()
    await expect(google).not.toHaveAttribute('aria-busy', 'true')

    // And the email route is reachable, which is what the stuck spinner blocked.
    await page.getByRole('button', { name: 'Use an email link instead' }).click()
    await expect(page.getByLabel('Email address')).toBeEnabled()
  })
})
