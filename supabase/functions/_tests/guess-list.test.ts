/**
 * The server-side spelling dictionary.
 *
 * This list is not a secret — the browser has the same words. What it must do
 * is accept every word a player could legitimately type, including every
 * possible answer, and reject the letter soup that would otherwise be worth
 * more information per guess than a real word.
 */

import { assert, assertEquals } from '@std/assert'
import { MODES } from '@wordroom/shared'
import { guessCount, isRealWord } from '../_shared/guess-list/index.ts'

Deno.test('each mode has a substantial list', () => {
  for (const mode of MODES) {
    assert(guessCount(mode) > 5_000, `${mode}-letter list is only ${guessCount(mode)} words`)
  }
})

Deno.test('accepts ordinary words', () => {
  assert(isRealWord('crane', 5))
  assert(isRealWord('purple', 6))
  assert(isRealWord('between', 7))
})

Deno.test('is case and whitespace insensitive', () => {
  assert(isRealWord('  CRANE ', 5))
})

Deno.test('rejects letter soup, which is the point of checking at all', () => {
  for (const soup of ['zzzzz', 'aeiou', 'qqqqq', 'xyzab']) {
    assertEquals(isRealWord(soup, 5), false, `${soup} should not be a word`)
  }
})

Deno.test('rejects a word of the wrong length for the mode', () => {
  assertEquals(isRealWord('crane', 6), false)
  assertEquals(isRealWord('purple', 5), false)
})

Deno.test('rejects anything that is not plain lowercase letters', () => {
  for (const bad of ['cr4ne', 'cr-ne', 'crâne', '']) {
    assertEquals(isRealWord(bad, 5), false, `${bad} should not be a word`)
  }
})

Deno.test('every possible answer is also a legal guess', async () => {
  // A curated answer missing from the guess list would be unsolvable: the
  // player types the right word and the server tells them it is not a word.
  const source = new URL('../../../docs/wordlists/wordlists.json', import.meta.url)
  const raw = JSON.parse(await Deno.readTextFile(source)) as Record<
    string,
    { answers?: string[] } | undefined
  >

  for (const mode of MODES) {
    const answers = raw[String(mode)]?.answers ?? []
    assert(answers.length > 0, `no ${mode}-letter answers in wordlists.json`)
    for (const answer of answers) {
      assert(isRealWord(answer, mode), `${answer} is an answer but not a legal guess`)
    }
  }
})
