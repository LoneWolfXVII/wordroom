import type { Page } from '@playwright/test'
import { losingLadder } from './api'
import {
  expectNoVerticalScroll,
  joinRoom,
  playGuess,
  startPlaying,
  uniqueName,
  waitForPlayable,
} from './app'
import type { Probe } from './fixtures'
import { test } from './fixtures'

/**
 * "The game screen fits 375×667 with no vertical scroll" is a claim about the
 * screen in every state it holds, not just an empty board — a filled board is
 * taller in the ways that matter, and a lost one adds the reveal line under it.
 *
 * Shared by the 375×667 and 360×640 specs so the two floors cannot drift apart.
 */
export async function assertGameScreenFits(page: Page, probe: Probe, label: string): Promise<void> {
  const { room, answer } = await probe.roomWithKnownAnswer(label)
  await joinRoom(page, room.code, uniqueName('Pal'))
  await startPlaying(page)

  await test.step('an empty board', async () => {
    await expectNoVerticalScroll(page, 'empty board')
  })

  const ladder = losingLadder(answer)

  await test.step('a board with guesses on it', async () => {
    for (const word of ladder.slice(0, 3)) {
      await playGuess(page, word)
    }
    await waitForPlayable(page)
    await expectNoVerticalScroll(page, 'three guesses in')
  })

  await test.step('a lost board, with the revealed word under it', async () => {
    for (const word of ladder.slice(3)) {
      await playGuess(page, word)
    }
    await expectNoVerticalScroll(page, 'after a fail')
  })
}
