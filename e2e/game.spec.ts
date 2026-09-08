import { losingLadder } from './support/api'
import {
  guessCount,
  joinRoom,
  playGuess,
  playRejectedGuess,
  revealLine,
  rows,
  startPlaying,
  statValue,
  uniqueName,
  waitForResult,
} from './support/app'
import { expect, requiresSupabase, test } from './support/fixtures'

requiresSupabase()

test('solving shows the result sheet, and an invalid word costs nothing', async ({
  page,
  probe,
}) => {
  const { room, answer } = await probe.roomWithKnownAnswer('solve')
  await joinRoom(page, room.code, uniqueName('Pal'))
  await startPlaying(page)

  const opener = losingLadder(answer)[0] ?? 'crane'
  await playGuess(page, opener)

  await test.step('a word that is not in the list does not consume a row', async () => {
    await playRejectedGuess(page, 'zzzzz')

    // The rule from CLAUDE.md: "An invalid word is not a guess." The count is
    // unchanged and the letters are still sitting in the active row, waiting to
    // be corrected.
    expect(await guessCount(page)).toBe(1)
    await expect(rows(page).nth(1)).toHaveText('zzzzz')
  })

  await test.step('the answer solves it', async () => {
    // Clear the rejected letters before typing the real guess.
    for (let index = 0; index < 5; index += 1) {
      await page.locator('[data-key="back"]').click()
    }
    await expect(rows(page).nth(1)).toHaveText('')
    await playGuess(page, answer)
  })

  await test.step('the result sheet reports the solve', async () => {
    const sheet = await waitForResult(page)

    await expect(sheet.getByText('Solved in 2')).toBeVisible()
    await expect(sheet.getByText(/Everyone in the room gets/)).toContainText(answer.toUpperCase())

    // Guesses used, the share grid, and the way on.
    expect(await statValue(sheet, 'guesses')).toBe('2')
    await expect(sheet.getByRole('img', { name: 'Your grid for puzzle 1' })).toBeVisible()
    await expect(sheet.getByRole('button', { name: 'Next puzzle' })).toBeVisible()
  })
})

test('failing reveals the word on the board and in the sheet', async ({ page, probe }) => {
  const { room, answer } = await probe.roomWithKnownAnswer('fail')
  await joinRoom(page, room.code, uniqueName('Pal'))
  await startPlaying(page)

  // Six real words, none of them the answer, so the fail is deterministic
  // rather than a hope.
  const ladder = losingLadder(answer)
  expect(ladder).toHaveLength(6)
  for (const word of ladder) {
    await playGuess(page, word)
  }

  await test.step('the board says what the word was', async () => {
    const line = revealLine(page)
    await expect(line).toContainText(answer.toUpperCase())
    // It is in the DOM from the start at opacity 0, so visibility is the wrong
    // question — being faded in is the assertion that means anything.
    await expect(line).toHaveCSS('opacity', '1')
  })

  await test.step('so does the result sheet, without the celebration', async () => {
    const sheet = await waitForResult(page)
    await expect(sheet.getByText('Not this time')).toBeVisible()
    await expect(sheet.getByText(/The word was/)).toContainText(answer.toUpperCase())
    await expect(sheet.getByRole('img', { name: 'Your grid for puzzle 1' })).toBeVisible()
    await expect(sheet.getByRole('button', { name: 'Next puzzle' })).toBeVisible()

    // A lost puzzle scores nothing, so the sheet shows a dash where a solve
    // shows the number of guesses. Asserted because it is a deliberate choice,
    // not an omission.
    expect(await statValue(sheet, 'guesses')).toBe('—')
  })
})
