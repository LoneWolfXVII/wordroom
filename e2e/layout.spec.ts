import { createRoom, startPlaying, uniqueName, waitForPlayable, warmRoutes } from './support/app'
import { expect, requiresSupabase, test, testRoomName } from './support/fixtures'
import { assertGameScreenFits } from './support/layout-checks'

requiresSupabase()

test('the game screen never scrolls', async ({ page, probe }) => {
  await assertGameScreenFits(page, probe, 'layout')
})

/**
 * The pale strip down the right of the panel.
 *
 * Vaul draws a 200%-wide `::after` outside the drawer in the drag direction so
 * an overdrag never reveals the page. From `--breakpoint-panel` up the sheet is
 * inset 24px, so that filler paints `--surface` in the gap where the scrim
 * belongs. It is a CSS-only fault with no behaviour to catch it, and the first
 * fix for it tied on specificity and silently lost — so this asserts the
 * computed value rather than trusting the stylesheet to have won.
 */
test('the sheet has no overdrag filler beside it in the panel layout', async ({ page }) => {
  await warmRoutes(page)
  await createRoom(page, testRoomName('strip'), uniqueName('Host'))
  await startPlaying(page)
  await waitForPlayable(page)
  await page.getByRole('button', { name: 'Settings' }).click()

  const sheet = page.locator('[data-vaul-drawer]')
  const panel = await page.evaluate(() => matchMedia('(min-width: 820px)').matches)
  const after = await sheet.evaluate((el) => getComputedStyle(el, '::after').content)

  // On a phone the sheet drags, so the filler has a job and must stay.
  expect(after).toBe(panel ? 'none' : '""')
})

/**
 * The puzzle number sits above the board and has to line up with it.
 *
 * The header is three grid columns, and a bare `1fr` is `minmax(auto,1fr)` — a
 * column that will not shrink below its content. The room-name button is wider
 * than the two icons opposite it, so with a long name the left column took more
 * than its half and pushed the number off centre. Measured rather than eyeballed
 * because 25px is exactly the kind of wrong that looks fine in isolation and
 * obviously wrong above a centred board.
 */
test('the puzzle number stays centred under a long room name', async ({ page }) => {
  await warmRoutes(page)
  await createRoom(page, `${testRoomName('centre')} with a very long name`, uniqueName('Host'))
  await startPlaying(page)
  await waitForPlayable(page)

  const offset = await page.evaluate(() => {
    const header = document.querySelector('header')
    const number = header?.querySelector('[data-testid="puzzle-number"]') ?? header?.children[1]
    if (!header || !number) return null
    const h = header.getBoundingClientRect()
    const n = number.getBoundingClientRect()
    return Math.abs(h.x + h.width / 2 - (n.x + n.width / 2))
  })

  // A pixel or two of rounding is fine; a column that took more than its half
  // is not.
  expect(offset).not.toBeNull()
  expect(offset ?? 99).toBeLessThan(2)
})
