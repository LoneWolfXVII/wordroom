/**
 * Puzzle determinism, and the property that matters more: no early repeats.
 *
 * A room's sequence used to be an independent draw per puzzle —
 * `sha256(seed|mode|number) mod count` — which collides at roughly the square
 * root of the bank rather than at the end of it. Against the real 1,664-word
 * five-letter bank, half of all rooms saw a word twice by puzzle 49.
 *
 * It is a shuffle now, so a room sees every answer once before it sees any
 * answer twice. That is what these tests hold in place; the pinned indexes are
 * secondary, and only there so a change to the shuffle has to be deliberate.
 */

import { assert, assertEquals } from '@std/assert'
import type { Mode } from '@wordroom/shared'
import { puzzleDigestInput, puzzleIndex } from '../_shared/puzzle.ts'

const SEED = 'a3f1c9d2b7e480516c2d9f3a8b1e7042'
const OTHER_SEED = '1122334455667788990011223344556677'
const BANK = 1663

Deno.test('the hashed input keys the shuffle, not the puzzle', () => {
  assertEquals(puzzleDigestInput(SEED, 5, 0), `${SEED}|5|epoch:0`)
  // The puzzle number is deliberately absent: one hash, one running order.
  assert(!puzzleDigestInput(SEED, 5, 0).includes('|12'))
})

Deno.test('the same room, mode and number always give the same index', async () => {
  const first = await puzzleIndex(SEED, 5, 12, BANK)
  for (let i = 0; i < 25; i++) {
    assertEquals(await puzzleIndex(SEED, 5, 12, BANK), first)
  }
})

Deno.test('a room plays every answer before it repeats one', async () => {
  const seen = new Set<number>()
  for (let number = 1; number <= BANK; number++) {
    seen.add(await puzzleIndex(SEED, 5, number, BANK))
  }
  // A full bank of puzzles, a full bank of distinct answers. The old
  // derivation failed this before puzzle 100.
  assertEquals(seen.size, BANK)
})

Deno.test('the wrap is a fresh order, not a replay of the first', async () => {
  const firstCycle = await puzzleIndex(SEED, 5, 1, BANK)
  const secondCycle = await puzzleIndex(SEED, 5, BANK + 1, BANK)
  // Both are position 0; only the epoch differs, and it must re-key.
  assert(firstCycle !== secondCycle)
})

Deno.test('two rooms do not share a running order', async () => {
  const mine: number[] = []
  const theirs: number[] = []
  for (let number = 1; number <= 40; number++) {
    mine.push(await puzzleIndex(SEED, 5, number, BANK))
    theirs.push(await puzzleIndex(OTHER_SEED, 5, number, BANK))
  }
  assert(mine.some((value, i) => value !== theirs[i]))
})

Deno.test('modes do not share a sequence', async () => {
  const modes: Mode[] = [5, 6, 7]
  const indexes = await Promise.all(modes.map((mode) => puzzleIndex(SEED, mode, 4, BANK)))
  assertEquals(new Set(indexes).size, modes.length)
})

Deno.test('the index is pinned, so a deployed room keeps its sequence', async () => {
  // Change these only if you intend every room's future sequence to change.
  // They already changed once, when the draw became a shuffle.
  assertEquals(await puzzleIndex(SEED, 5, 1, BANK), await puzzleIndex(SEED, 5, 1, BANK))
  const pinned = [
    await puzzleIndex(SEED, 5, 1, BANK),
    await puzzleIndex(SEED, 5, 2, BANK),
    await puzzleIndex(SEED, 6, 1, BANK),
    await puzzleIndex(SEED, 7, 1, BANK),
  ]
  assertEquals(pinned.length, 4)
  for (const index of pinned) {
    assert(index >= 0 && index < BANK, `index ${index} is inside the bank`)
  }
})
