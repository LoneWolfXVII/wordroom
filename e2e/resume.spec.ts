import { losingLadder } from './support/api'
import {
  expectPuzzleNumber,
  guessCount,
  joinRoom,
  playGuess,
  startPlaying,
  uniqueName,
  waitForPlayable,
  waitForResult,
} from './support/app'
import { expect, requiresSupabase, test } from './support/fixtures'

requiresSupabase()

test('a reload returns the player to the puzzle they were on', async ({ page, probe }) => {
  const { room, answer } = await probe.roomWithKnownAnswer('resume')
  await joinRoom(page, room.code, uniqueName('Pal'))
  await startPlaying(page)

  await test.step('finish No. 1 and start No. 2', async () => {
    await playGuess(page, losingLadder(answer)[0] ?? 'crane')
    await playGuess(page, answer)

    const sheet = await waitForResult(page)
    await sheet.getByRole('button', { name: 'Next puzzle' }).click()
    await expectPuzzleNumber(page, 2)
    await waitForPlayable(page)

    // One guess on No. 2, so there is an unfinished attempt to come back to.
    await playGuess(page, 'crane')
  })

  await test.step('a reload lands on No. 2, not back at the start', async () => {
    await page.reload()
    await waitForPlayable(page, 60_000)
    await expectPuzzleNumber(page, 2)
  })
})

/**
 * Resuming restores the board, not just the puzzle number.
 *
 * This was a `test.fail()` for a real gap: `resumePuzzleNumber` picked the right
 * number but `loadPuzzle` always started from `freshPuzzleState`, so a reload
 * mid-puzzle showed six empty rows while the server still held the guesses
 * spent — and the next guess was scored as the second and drawn in the first
 * row. `loadPuzzle` now takes the attempt the server still has.
 */
test('resuming also restores the guesses already spent', async ({ page, probe }) => {
  const { room } = await probe.createRoom('resume-board')
  await joinRoom(page, room.code, uniqueName('Pal'))
  await startPlaying(page)

  await playGuess(page, 'crane')
  expect(await guessCount(page)).toBe(1)

  await page.reload()
  await waitForPlayable(page, 60_000)
  await expectPuzzleNumber(page, 1)

  expect(await guessCount(page)).toBe(1)
})
