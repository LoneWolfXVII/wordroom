import {
  createRoom,
  rows,
  startPlaying,
  uniqueName,
  waitForPlayable,
  warmRoutes,
} from './support/app'
import { expect, requiresSupabase, test, testRoomName } from './support/fixtures'

requiresSupabase()

/**
 * The 6- and 7-letter modes were built with the rest of the game and hidden
 * behind the switcher until they shipped. A 7-letter row at the 5-letter tile
 * size is wider than a phone, so this pins both halves: the switch works, and
 * the board still fits.
 */
test('7 letters gives a 7-wide board that fits the screen', async ({ page }) => {
  await warmRoutes(page)
  await createRoom(page, testRoomName('modes'), uniqueName('Host'))
  await startPlaying(page)
  await waitForPlayable(page)

  await page.getByRole('radio', { name: '7' }).click()
  await waitForPlayable(page)

  const firstRow = rows(page).first()
  await expect(firstRow.locator('> *')).toHaveCount(7)

  const box = await firstRow.boundingBox()
  const viewport = page.viewportSize()
  expect(box).not.toBeNull()
  expect(viewport).not.toBeNull()
  if (!box || !viewport) return
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)

  const scrolls = await page.evaluate(
    () => document.documentElement.scrollHeight > window.innerHeight,
  )
  expect(scrolls).toBe(false)

  await page.getByRole('button', { name: 'Leaderboard' }).click()
  await expect(page.getByRole('dialog').getByText('7 letters')).toBeVisible()
})
