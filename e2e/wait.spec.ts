import {
  createRoom,
  expectPuzzleNumber,
  joinRoom,
  newPlayerPage,
  playGuess,
  startPlaying,
  uniqueName,
  waitForResult,
  warmRoutes,
} from './support/app'
import { expect, requiresSupabase, test, testRoomName } from './support/fixtures'

requiresSupabase()

/**
 * Wait mode, with two browsers: the host finishes first and waits for the
 * friend by name; the friend finishes and both go on together.
 */
test('in Wait mode the room moves on together', async ({
  browser,
  friendSession,
  page,
  probe,
}) => {
  await warmRoutes(page)
  const roomName = testRoomName('wait')
  const code = await createRoom(page, roomName, uniqueName('Host'))
  const answer = await probe.answerFor(code, uniqueName('Bot'))
  await startPlaying(page)

  await page.getByRole('button', { name: roomName }).first().click()
  const roomSheet = page.getByRole('dialog')
  await roomSheet.getByRole('radio', { name: 'Wait' }).click()
  await expect(roomSheet.getByText(/Everyone finishes a puzzle/)).toBeVisible()
  await page.keyboard.press('Escape')

  const friend = await newPlayerPage(browser, page.viewportSize(), friendSession)
  const friendName = uniqueName('Pal')
  try {
    await joinRoom(friend, code, friendName)
    await startPlaying(friend)
    await expectPuzzleNumber(friend, 1)

    // The friend sees the pace but cannot change it.
    await friend.getByRole('button', { name: roomName }).first().click()
    await expect(friend.getByRole('dialog').getByText(/The host sets this/)).toBeVisible()
    await friend.keyboard.press('Escape')

    await playGuess(page, answer)
    const hostResult = await waitForResult(page)
    await expect(hostResult.getByText(`Waiting for ${friendName}`)).toBeVisible()
    await expect(hostResult.getByRole('button', { name: 'Next puzzle' })).toBeDisabled()

    await playGuess(friend, answer)
    const friendResult = await waitForResult(friend)
    await expect(friendResult.getByRole('button', { name: 'Next puzzle' })).toBeEnabled()

    // The host's Next opens on its own, without a reload.
    await expect(hostResult.getByRole('button', { name: 'Next puzzle' })).toBeEnabled({
      timeout: 15_000,
    })
    await hostResult.getByRole('button', { name: 'Next puzzle' }).click()
    await friendResult.getByRole('button', { name: 'Next puzzle' }).click()
    await expectPuzzleNumber(page, 2)
    await expectPuzzleNumber(friend, 2)
  } finally {
    await friend.context().close()
  }
})
