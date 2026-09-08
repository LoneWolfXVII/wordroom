/**
 * Puzzle determinism.
 *
 * The database part (select by offset from a rank-ordered word bank) is fixed
 * by the query. The part that could drift is the index, so that is what is
 * pinned here: the same room, mode and number must always land on the same row.
 */

import { assert, assertEquals } from '@std/assert'
import type { Mode } from '@wordroom/shared'
import { puzzleDigestInput, puzzleIndex } from '../_shared/puzzle.ts'

const SEED = 'a3f1c9d2b7e480516c2d9f3a8b1e7042'
const BANK = 1663

Deno.test('the hashed input is exactly seed|mode|number', () => {
  assertEquals(puzzleDigestInput(SEED, 5, 12), `${SEED}|5|12`)
})

Deno.test('the same room, mode and number always give the same index', async () => {
  const first = await puzzleIndex(SEED, 5, 12, BANK)
  for (let i = 0; i < 25; i++) {
    assertEquals(await puzzleIndex(SEED, 5, 12, BANK), first)
  }
})

Deno.test('the index is pinned, so a deployed room keeps its sequence', async () => {
  // Change these numbers only if you intend every existing room's puzzle
  // sequence to change with them.
  assertEquals(await puzzleIndex(SEED, 5, 1, BANK), 1041)
  assertEquals(await puzzleIndex(SEED, 5, 2, BANK), 139)
  assertEquals(await puzzleIndex(SEED, 6, 1, BANK), 1463)
  assertEquals(await puzzleIndex(SEED, 7, 1, BANK), 517)
})

Deno.test('modes do not share a sequence', async () => {
  const modes: Mode[] = [5, 6, 7]
  const indexes = await Promise.all(modes.map((mode) => puzzleIndex(SEED, mode, 4, BANK)))
  assertEquals(new Set(indexes).size, modes.length)
})

Deno.test('different rooms get different sequences from the same number', async () => {
  const a = await puzzleIndex(SEED, 5, 1, BANK)
  const b = await puzzleIndex('0000000000000000000000000000ffff', 5, 1, BANK)
  assert(a !== b)
})

Deno.test('the index always lands inside the bank', async () => {
  for (let number = 1; number <= 400; number++) {
    const index = await puzzleIndex(SEED, 5, number, BANK)
    assert(Number.isInteger(index) && index >= 0 && index < BANK, `index ${index} out of range`)
  }
})

Deno.test('consecutive numbers do not repeat a word straight away', async () => {
  const seen: number[] = []
  for (let number = 1; number <= 120; number++) {
    seen.push(await puzzleIndex(SEED, 5, number, BANK))
  }
  // With a bank of 1663 and 120 draws, a handful of collisions is expected;
  // a systematic pattern would show up as a much smaller set than this.
  assert(new Set(seen).size > 110, `too few distinct answers: ${new Set(seen).size}`)
})

Deno.test('a one-word bank is still valid, not a crash', async () => {
  assertEquals(await puzzleIndex(SEED, 5, 99, 1), 0)
})
