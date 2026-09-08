import { losingLadder } from './support/api'
import {
  expectPuzzleNumber,
  joinRoom,
  playGuess,
  startPlaying,
  uniqueName,
  waitForPlayable,
  waitForResult,
} from './support/app'
import { expect, requiresSupabase, test } from './support/fixtures'

requiresSupabase()

/**
 * The whole loop with `prefers-reduced-motion: reduce`.
 *
 * The app branches on it in three places that a test can hang on: the row
 * reveal, the timer that opens the result sheet, and the 350ms floor on the
 * board swap. Under reduce they all collapse to zero — which is the risk. Code
 * that waits for an animation to *end* waits forever when the animation never
 * starts, so this plays a puzzle through to the next one at ordinary timeouts
 * and fails if anything stalls.
 */
test('the whole loop works with animations off', async ({ page, probe }) => {
  const { room, answer } = await probe.roomWithKnownAnswer('reduced')
  await joinRoom(page, room.code, uniqueName('Pal'))
  await startPlaying(page)

  // Guard against the project setting silently going away.
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
    true,
  )

  await playGuess(page, losingLadder(answer)[0] ?? 'crane')
  await playGuess(page, answer)

  const sheet = await waitForResult(page)
  await expect(sheet.getByText('Solved in 2')).toBeVisible()

  await sheet.getByRole('button', { name: 'Next puzzle' }).click()
  await expectPuzzleNumber(page, 2)
  await waitForPlayable(page)
})
