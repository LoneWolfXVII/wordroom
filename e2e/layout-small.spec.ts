import { requiresSupabase, test } from './support/fixtures'
import { assertGameScreenFits } from './support/layout-checks'

requiresSupabase()

// The `small` project pins this to 360×640, the second floor CLAUDE.md names.
test('the game screen never scrolls at 360×640', async ({ page, probe }) => {
  await assertGameScreenFits(page, probe, 'layout360')
})
