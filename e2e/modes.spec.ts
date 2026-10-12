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

/**
 * Clicking a length leaves focus on the switcher, and a focused button takes
 * Enter for itself. So a player on a computer picked 7, typed a word, pressed
 * Enter, and nothing happened.
 */
test('Enter submits after picking a length with the mouse', async ({ page }) => {
  await warmRoutes(page)
  await createRoom(page, testRoomName('modes-enter'), uniqueName('Host'))
  await startPlaying(page)
  await waitForPlayable(page)

  await page.getByRole('radio', { name: '6' }).click()
  await waitForPlayable(page)
  await page.keyboard.type('planet')
  await page.keyboard.press('Enter')
  await expect(page.locator('main').locator('.bg-correct, .bg-present, .bg-absent')).toHaveCount(6)
})

/**
 * Switching length used to open a remembered number, or No. 1 for a length not
 * yet opened this visit, with an empty board. Coming back to a length now
 * resumes it: the same puzzle, with the rows already played.
 */
test('switching back to a length keeps its board', async ({ page }) => {
  await warmRoutes(page)
  await createRoom(page, testRoomName('modes-back'), uniqueName('Host'))
  await startPlaying(page)
  await waitForPlayable(page)

  await page.getByRole('radio', { name: '6' }).click()
  await waitForPlayable(page)
  await page.keyboard.type('planet')
  await page.keyboard.press('Enter')
  const played = page.locator('main').locator('.bg-correct, .bg-present, .bg-absent')
  await expect(played).toHaveCount(6)

  await page.getByRole('radio', { name: '5' }).click()
  await waitForPlayable(page)
  await expect(played).toHaveCount(0)

  await page.getByRole('radio', { name: '6' }).click()
  await waitForPlayable(page)
  await expect(played).toHaveCount(6)
})
