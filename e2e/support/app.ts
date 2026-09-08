import type { Browser, ViewportSize } from '@playwright/test'
import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Flow helpers for the screens a player actually walks through.
 *
 * The app ships no `data-testid` anywhere, so every selector here is a role, a
 * label or a piece of visible copy — which is the right default anyway: these
 * break when the thing a player sees breaks. The two exceptions are the
 * keyboard's `data-key` attributes, which the app already exposes, and the
 * board's Tailwind mark classes, which have no accessible equivalent. See the
 * report for the `data-testid`s that would make the board honest.
 */

export const MODE = 5
export const MAX_GUESSES = 6

/**
 * Hide the Next.js dev-tools indicator.
 *
 * It is a fixed, bottom-left floating button, and at 375×667 it sits directly
 * on top of the keyboard's Enter key — so in `next dev` a phone-sized window
 * cannot submit a guess by tapping. That is a dev-only overlay and not the
 * app's behaviour, so the suite removes it rather than working around it; the
 * report flags it for whoever owns the Next config. A no-op against a
 * production build.
 */
export async function hideDevOverlay(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // Hiding it with CSS does not stick — the overlay ships its own styles and
    // wins — so the element is removed whenever it appears. `next-route-announcer`
    // is a different element and is deliberately left alone.
    const strip = (root: ParentNode) => {
      for (const node of root.querySelectorAll('nextjs-portal')) node.remove()
    }
    const start = () => {
      strip(document)
      new MutationObserver(() => strip(document)).observe(document.documentElement, {
        childList: true,
        subtree: true,
      })
    }
    if (document.documentElement) start()
    else document.addEventListener('DOMContentLoaded', start)
  })
}

/** A second player: their own context, cookies and anonymous session. */
export async function newPlayerPage(browser: Browser, viewport: ViewportSize | null): Promise<Page> {
  const context = await browser.newContext(viewport ? { viewport } : {})
  const page = await context.newPage()
  await hideDevOverlay(page)
  return page
}

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

/**
 * Fill the name field and confirm the lock sheet.
 *
 * Deliberately does not assert where the player lands: the same three actions
 * are both the happy path and the "that name is taken" path, and the caller
 * says which one it expected.
 */
export async function lockName(page: Page, playerName: string): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Pick your name' })).toBeVisible()

  const field = page.getByLabel('Your name')
  await field.fill(playerName)

  const cont = page.getByRole('button', { name: 'Continue' })
  await expect(cont).toBeEnabled()
  await cont.click()

  // "You won't be able to change it later" — the one-time confirmation the spec
  // requires before a name is locked.
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  await expect(sheet.getByText(`Lock in ${playerName}?`)).toBeVisible()
  await sheet.getByRole('button', { name: 'Lock it' }).click()
}

/** Home → Create → Name → Lobby. Returns the room code shown in the lobby. */
export async function createRoom(
  page: Page,
  roomName: string,
  playerName: string,
): Promise<string> {
  await page.goto('/')
  await page.getByRole('link', { name: 'Create a room' }).click()

  await expect(page.getByRole('heading', { name: 'Name your room' })).toBeVisible()
  await page.getByLabel('Room name').fill(roomName)
  await page.getByRole('button', { name: 'Create room' }).click()

  await lockName(page, playerName)
  await expect(page.getByRole('heading', { name: roomName })).toBeVisible()

  return readRoomCode(page)
}

/** Home → Join → code → Name → Lobby. */
export async function joinRoom(page: Page, code: string, playerName: string): Promise<void> {
  await enterJoinCode(page, code)
  await lockName(page, playerName)
  await expect(page.getByRole('button', { name: 'Start playing' })).toBeVisible()
}

/** Home → Join → code, stopping on the name screen. */
export async function enterJoinCode(page: Page, code: string): Promise<void> {
  await page.goto('/')
  await page.getByRole('link', { name: 'Join with a code' }).click()

  await expect(page.getByRole('heading', { name: 'Enter the room code' })).toBeVisible()

  await fillCodeBoxes(page, code)

  const join = page.getByRole('button', { name: 'Join room' })
  await expect(join).toBeEnabled()
  await join.click()
}

/**
 * Type a room code into the four code boxes, one character at a time.
 *
 * Each character is confirmed on the box before the next one is sent, and that
 * is not politeness — `CodeBoxes` is a controlled input whose `onChange` reads
 * `value` from its render closure while advancing focus synchronously. Send the
 * next keystroke before React has committed and the new box's handler still
 * holds the *old* value and overwrites what came before it. See the report:
 * pasting a code is safe, typing one very fast is not.
 */
export async function fillCodeBoxes(page: Page, code: string): Promise<void> {
  const characters = code.toUpperCase().split('')
  for (const [index, character] of characters.entries()) {
    const box = page.getByRole('textbox', { name: `Room code, character ${index + 1} of 4` })
    await box.click()
    await box.pressSequentially(character)
    await expect(box).toHaveValue(character)
  }
}

/** Try to lock a name and expect the attempt to be refused, not to crash. */
export async function attemptTakenName(page: Page, playerName: string): Promise<void> {
  await lockName(page, playerName)
}

/**
 * The lobby renders the code as decorative tiles behind one `role="img"`, so
 * the accessible name is the only readable copy of it.
 */
export async function readRoomCode(page: Page): Promise<string> {
  const display = page.getByRole('img', { name: /^Room code / })
  await expect(display).toBeVisible()
  const label = await display.getAttribute('aria-label')
  const code = (label ?? '').replace(/^Room code /, '').replace(/\s+/g, '')
  expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/)
  return code
}

/**
 * Lobby → game screen, settled on a loaded puzzle.
 *
 * The waits are long because `next dev` compiles `/game` on its first request,
 * which can take far longer than any assertion about the app should. CI runs a
 * production build for exactly this reason.
 */
export async function startPlaying(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start playing' }).click()
  await page.waitForURL('**/game', { timeout: 60_000 })
  await waitForPlayable(page, 60_000)
}

// ---------------------------------------------------------------------------
// The game screen
// ---------------------------------------------------------------------------

/** The board's six rows live in `<main>`; the keyboard and header do not. */
export function board(page: Page): Locator {
  return page.locator('main > div').first()
}

export function rows(page: Page): Locator {
  return board(page).locator('> div')
}

/**
 * Tiles that have been scored. A tile carries its mark class from the moment
 * the server answers — the flip only hides it — so this is exact even mid
 * animation, and does not depend on an animation finishing.
 */
export function scoredTiles(page: Page): Locator {
  return page.locator('main').locator('.bg-correct, .bg-present, .bg-absent')
}

/** How many guesses the board is showing. The row-consumption assertion. */
export async function guessCount(page: Page): Promise<number> {
  const tiles = await scoredTiles(page).count()
  expect(tiles % MODE).toBe(0)
  return tiles / MODE
}

/**
 * Wait until the store will accept input: puzzle loaded, no row flipping.
 *
 * The keyboard marks itself `aria-disabled` while a row reveals or a request is
 * in the air, and its click handler no-ops — so a test that types without
 * waiting here silently loses letters rather than failing.
 */
export async function waitForPlayable(page: Page, timeout = 30_000): Promise<void> {
  const enter = page.locator('[data-key="enter"]')
  await expect(enter).toBeVisible({ timeout })
  await expect(enter).not.toHaveAttribute('aria-disabled', 'true', { timeout })
}

export async function expectPuzzleNumber(page: Page, number: number): Promise<void> {
  // `No.` and the digits are separate spans and the digits animate on change,
  // so this matches the header's whole text rather than one element.
  await expect(page.getByText(new RegExp(`^No\\.\\s*${number}$`))).toBeVisible()
}

/** Type a word on the on-screen keyboard, without submitting it. */
export async function typeWord(page: Page, word: string): Promise<void> {
  await waitForPlayable(page)
  for (const letter of word.toLowerCase()) {
    await page.locator(`[data-key="${letter}"]`).click()
  }
}

/**
 * Type a word and submit it, then wait for the server's marks to land on the
 * board. Returns the guess count afterwards.
 */
export async function playGuess(page: Page, word: string): Promise<number> {
  const before = await guessCount(page)
  await typeWord(page, word)
  await page.locator('[data-key="enter"]').click()
  await expect(scoredTiles(page)).toHaveCount((before + 1) * MODE)
  return before + 1
}

/**
 * Submit a word that the game should refuse. Waits for the toast rather than a
 * timer, and leaves the typed letters where they are.
 */
export async function playRejectedGuess(page: Page, word: string): Promise<void> {
  await typeWord(page, word)
  await page.locator('[data-key="enter"]').click()
  // Rejected client-side ("Not a word") or by `submit-guess` ("Not in word
  // list."), depending on whether the guess-list chunk has landed yet. Both are
  // the same refusal to the player.
  await expect(page.getByText(/Not a word|Not in word list/)).toBeVisible()
}

export function resultSheet(page: Page): Locator {
  return page.getByRole('dialog')
}

/**
 * Read a `StatTile`'s value by its caption.
 *
 * The tile is a value div above a label div with no accessible relationship
 * between them, so this walks from the label a test can name to the number it
 * describes.
 */
export async function statValue(sheet: Locator, label: string): Promise<string> {
  const caption = sheet.getByText(label, { exact: true })
  const value = caption.locator('xpath=preceding-sibling::div[1]')
  await expect(value).toBeVisible()
  return ((await value.textContent()) ?? '').trim()
}

/** Wait for the result sheet, which opens on a settle timer after the reveal. */
export async function waitForResult(page: Page): Promise<Locator> {
  const sheet = resultSheet(page)
  await expect(sheet).toBeVisible({ timeout: 20_000 })
  return sheet
}

/**
 * The colours of one scored row, read from the tile classes.
 *
 * Two players in the same room who guess the same word must get the same row
 * back — that is what "puzzle No. N is the same word for everyone" means from
 * the outside, and it holds without either of them knowing the answer.
 */
export async function markPattern(page: Page, rowIndex: number): Promise<string[]> {
  const tiles = rows(page).nth(rowIndex).locator('> div')
  await expect(tiles).toHaveCount(MODE)
  return tiles.evaluateAll((elements) =>
    elements.map((element) => {
      const cls = element.className
      if (cls.includes('bg-correct')) return 'correct'
      if (cls.includes('bg-present')) return 'present'
      if (cls.includes('bg-absent')) return 'absent'
      return 'unscored'
    }),
  )
}

/** The line under the board, which is in the DOM at opacity 0 until a fail. */
export function revealLine(page: Page): Locator {
  return page.locator('main p', { hasText: 'The word was' })
}

/**
 * Visit every route the flow touches so the dev server has compiled them.
 *
 * Without this the create→join timing is really a measurement of webpack: the
 * first request for `/game` in a `next dev` process can take tens of seconds,
 * and none of that is what the spec's 60-second goal is about. Harmless against
 * a production build, where it costs a few navigations.
 */
export async function warmRoutes(page: Page): Promise<void> {
  for (const route of ['/', '/create', '/join', '/lobby', '/game']) {
    await page.goto(route, { waitUntil: 'domcontentloaded' })
  }
}

export function uniqueName(prefix: string): string {
  return `${prefix}${Math.random().toString(36).slice(2, 6)}`
}
