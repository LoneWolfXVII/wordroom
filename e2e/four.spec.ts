import { createRoom, startPlaying, uniqueName, waitForPlayable, warmRoutes } from './support/app'
import { expect, requiresSupabase, test, testRoomName } from './support/fixtures'

requiresSupabase()

/** Tiles a guess has coloured, across all four boards. */
const SCORED = '[data-board] :is(.bg-correct, .bg-present, .bg-absent)'

const GUESSES = ['crane', 'sloth', 'pudgy', 'mince', 'brawl', 'fight', 'joker', 'vivid', 'quack']

/**
 * Four at once, played to the end: four boards that fit a phone, an invalid
 * word that costs nothing, nine guesses on every unsolved board, every word
 * revealed at the end, and one game on the Four leaderboard.
 */
test('a Four at once game, start to finish', async ({ page }) => {
  await warmRoutes(page)
  await createRoom(page, testRoomName('four'), uniqueName('Host'))
  await startPlaying(page)
  await waitForPlayable(page)

  await page.getByRole('radio', { name: 'Four' }).click()
  const boards = page.locator('[data-board]')
  await expect(boards).toHaveCount(4)

  const scrolls = await page.evaluate(
    () => document.documentElement.scrollHeight > window.innerHeight,
  )
  expect(scrolls).toBe(false)

  // An invalid word is not a guess.
  await page.keyboard.type('zzzzz')
  await page.keyboard.press('Enter')
  await expect(page.getByText('Not in word list.')).toBeVisible()
  for (let i = 0; i < 5; i++) await page.keyboard.press('Backspace')
  await expect(
    page.locator(
      '[data-board="1"] .bg-absent, [data-board="1"] .bg-present, [data-board="1"] .bg-correct',
    ),
  ).toHaveCount(0)

  // A reload comes back to Four, on the same game, with the row it took.
  await page.keyboard.type('crane')
  await page.keyboard.press('Enter')
  await expect(page.locator(SCORED)).toHaveCount(20)
  await page.reload()
  await expect(page.locator('[data-board]')).toHaveCount(4)
  await expect(page.locator(SCORED)).toHaveCount(20)

  for (const word of GUESSES.slice(1)) {
    const scored = await page.locator(SCORED).count()
    await page.keyboard.type(word)
    await page.keyboard.press('Enter')
    await expect.poll(async () => page.locator(SCORED).count()).toBeGreaterThan(scored)
    if (await page.getByRole('dialog').isVisible()) break
  }

  const result = page.getByRole('dialog')
  await expect(result).toBeVisible()
  await expect(result.getByText('points')).toBeVisible()
  // Every board's word is in the result, in place of a dash.
  await expect(result.locator('li b')).toHaveCount(4)
  await expect(result.locator('li b', { hasText: '—' })).toHaveCount(0)

  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Leaderboard' }).click()
  const board = page.getByRole('dialog')
  await expect(board.getByText('Four at once')).toBeVisible()
  await expect(board.getByRole('img', { name: /^Four boards:/ })).toHaveCount(1)
})
