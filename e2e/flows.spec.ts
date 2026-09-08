import {
  createRoom,
  enterJoinCode,
  expectPuzzleNumber,
  joinRoom,
  lockName,
  markPattern,
  newPlayerPage,
  playGuess,
  startPlaying,
  uniqueName,
  waitForPlayable,
  waitForResult,
  warmRoutes,
} from './support/app'
import { expect, requiresSupabase, test, testRoomName } from './support/fixtures'

requiresSupabase()

test('a host creates a room and a friend is playing puzzle No. 1', async ({
  browser,
  page,
  probe,
}) => {
  const roomName = testRoomName('flow')
  const hostName = uniqueName('Host')
  const friendName = uniqueName('Pal')

  // Compile the routes before the clock starts; see `warmRoutes`.
  await warmRoutes(page)

  const startedAt = Date.now()

  const code = await test.step('the host creates a room and the code appears in the lobby', () =>
    createRoom(page, roomName, hostName))

  const friend = await newPlayerPage(browser, page.viewportSize())

  try {
    await test.step('a second browser joins with that code and lands on puzzle No. 1', async () => {
      await joinRoom(friend, code, friendName)
      await startPlaying(friend)
      await expectPuzzleNumber(friend, 1)
    })

    // Goal 1 of the spec: a friend playing the same sequence "within 60
    // seconds". Recorded as an annotation because the useful thing is the
    // trend against a live backend, not a tight bound.
    const elapsedMs = Date.now() - startedAt
    const seconds = (elapsedMs / 1000).toFixed(1)
    test.info().annotations.push({
      type: 'create-to-join',
      description: `${seconds}s — home screen to friend on puzzle No. 1`,
    })
    process.stdout.write(`\n  create → join → puzzle No. 1: ${seconds}s\n`)
    expect(elapsedMs).toBeLessThan(60_000)

    await test.step('both players see the same puzzle number and the same board', async () => {
      await startPlaying(page)
      await expectPuzzleNumber(page, 1)

      // The same number is necessary but not sufficient: the room promises the
      // same *word*. One shared guess proves it, and neither player has to know
      // the answer for the proof to hold.
      await playGuess(page, 'crane')
      await playGuess(friend, 'crane')

      const hostRow = await markPattern(page, 0)
      const friendRow = await markPattern(friend, 0)
      expect(hostRow).toEqual(friendRow)
      expect(hostRow).not.toContain('unscored')
    })

    await test.step('the host advances while the friend has not finished', async () => {
      const answer = await probe.answerFor(code, uniqueName('Bot'))
      await playGuess(page, answer)

      const sheet = await waitForResult(page)
      await sheet.getByRole('button', { name: 'Next puzzle' }).click()

      await expectPuzzleNumber(page, 2)
      await waitForPlayable(page)

      // Nobody waits: the friend is untouched, still on No. 1 with one guess.
      await expectPuzzleNumber(friend, 1)
      await expect(friend.locator('main').locator('.bg-correct, .bg-present, .bg-absent')).toHaveCount(
        5,
      )
    })
  } finally {
    await friend.context().close()
  }
})

test('a name already taken in the room is refused on the field', async ({ page, probe }) => {
  const { room } = await probe.createRoom('names')

  await enterJoinCode(page, room.code)

  await test.step('the probe already holds this name', async () => {
    await lockName(page, 'Probe')

    // On the field, not a crash and not a redirect. `getByRole('alert')` alone
    // would also match Next's route announcer, so this asks for the message.
    const message = page.getByText('Someone in this room already has that name.')
    await expect(message).toBeVisible()
    await expect(message).toHaveAttribute('role', 'alert')
    await expect(page.getByLabel('Your name')).toHaveAttribute('aria-invalid', 'true')
    await expect(page).toHaveURL(/\/name$/)
  })

  await test.step('a different name is accepted from the same screen', async () => {
    await lockName(page, uniqueName('Pal'))
    await expect(page.getByRole('heading', { name: room.name })).toBeVisible()
    await startPlaying(page)
    await expectPuzzleNumber(page, 1)
  })
})
