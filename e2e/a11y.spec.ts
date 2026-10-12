import { expect, requiresSupabase, test } from './support/fixtures'

requiresSupabase()

test('keyboard focus is visible', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'How to play' })).toBeVisible()

  await page.keyboard.press('Tab')

  // globals.css defines one focus ring for the whole app:
  // `:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px }`
  // with --color-accent #2F5D62. A ring that stops being drawn is the failure
  // this catches, so it asserts the computed value rather than a class name.
  const ring = await page.evaluate(() => {
    const element = document.activeElement
    if (!(element instanceof HTMLElement)) return null
    const style = getComputedStyle(element)
    return {
      tag: element.tagName,
      style: style.outlineStyle,
      width: style.outlineWidth,
      color: style.outlineColor,
      offset: style.outlineOffset,
    }
  })

  expect(ring, 'nothing took focus on Tab').not.toBeNull()
  expect(ring?.style).toBe('solid')
  expect(ring?.width).toBe('2px')
  // Except a ring drawn inside an accent surface — the home screen's room
  // card, first in the tab order once the account holds a room — where an
  // accent ring would vanish, so it is on-accent and inset. A ring outside the
  // element, even an accent button's, stays accent.
  if (ring?.offset.startsWith('-')) {
    expect(ring.color).toBe('rgb(245, 241, 234)')
  } else {
    expect(ring?.color).toBe('rgb(47, 93, 98)')
    expect(ring?.offset).toBe('2px')
  }
})

test('a sheet traps focus and closes on Escape', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'How to play' }).click()

  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  await expect(sheet.getByText('Guess the word in six tries')).toBeVisible()

  await test.step('Tab never leaves the sheet', async () => {
    // Enough presses to cycle past the end of any sensible sheet and wrap.
    for (let press = 0; press < 15; press += 1) {
      await page.keyboard.press('Tab')
      const inside = await sheet.evaluate((element) => element.contains(document.activeElement))
      expect(inside, `focus escaped the sheet after ${press + 1} tabs`).toBe(true)
    }
  })

  await test.step('Escape closes it', async () => {
    await page.keyboard.press('Escape')
    await expect(sheet).toBeHidden()
  })
})
