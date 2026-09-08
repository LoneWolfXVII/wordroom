import { losingLadder } from './support/api'
import {
  guessCount,
  joinRoom,
  playGuess,
  startPlaying,
  uniqueName,
  waitForResult,
} from './support/app'
import { expect, requiresSupabase, test } from './support/fixtures'

requiresSupabase()

/**
 * The one rule: answers never reach the client.
 *
 * `submit-guess` releases an answer only once an attempt is finished, and every
 * other body is checked against it server-side by `assertAnswerAbsent`. The
 * column grants say the same thing from underneath: `puzzles.answer` and
 * `attempts.guesses` have no grant for `authenticated`, so neither a REST read
 * nor a realtime frame can carry them.
 *
 * This is the browser-side half of that control. It watches every response body
 * and every websocket frame for a whole session and asserts a known answer is
 * not in any of them — while a *different* player in the same room has already
 * solved that very puzzle, which is the case that would break if realtime ever
 * started shipping `guesses`, since a solved attempt's last guess is the answer.
 *
 * The app's own JS bundles are excluded on purpose: they legitimately ship the
 * ten-thousand-word guess list, which contains the answer along with every
 * other spellable word. See `wire.ts`.
 */
test('the answer never reaches a player who has not finished', async ({ page, probe, wire }) => {
  const { room, answer } = await probe.roomWithKnownAnswer('security')

  // A solved attempt's last guess *is* the answer, and it now sits in this
  // room's `attempts.guesses`. That is the row the leaderboard's realtime
  // subscription is watching.
  await test.step('another player in the room solves this very puzzle', () =>
    probe.solveAsRival(room, answer, uniqueName('Rival')))

  await joinRoom(page, room.code, uniqueName('Pal'))
  await startPlaying(page)

  await test.step('read everything the room will show a player mid-puzzle', async () => {
    // The leaderboard is the realtime subscriber on `attempts`, and the room
    // sheet is the one on `players`. Both are opened so their frames are on the
    // wire before the assertion runs.
    await page.getByRole('button', { name: 'Leaderboard' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()

    const ladder = losingLadder(answer)
    await playGuess(page, ladder[0] ?? 'crane')
    await playGuess(page, ladder[1] ?? 'pilot')
    expect(await guessCount(page)).toBe(2)
  })

  await test.step('the answer is in nothing the backend sent', async () => {
    await wire.settle()

    // A vacuous assertion is worse than no assertion, so record what was
    // actually inspected.
    expect(wire.backendCount).toBeGreaterThan(5)
    test.info().annotations.push({
      type: 'wire',
      description: `${wire.size} responses and frames inspected, ${wire.backendCount} from the backend`,
    })

    const hits = wire.find(answer)
    expect(
      hits,
      `The answer reached the client before it was earned:\n${wire.describe(answer)}`,
    ).toHaveLength(0)
  })

  await test.step('and the check is not vacuous — finishing does deliver it', async () => {
    // If this fails, the assertion above proved nothing: the recorder would be
    // blind to an answer that really was on the wire.
    await playGuess(page, answer)
    await waitForResult(page)
    await wire.settle()

    expect(
      wire.find(answer).length,
      'The recorder never saw the answer even after the puzzle was solved, ' +
        'so the assertion above cannot detect a leak.',
    ).toBeGreaterThan(0)
  })
})
