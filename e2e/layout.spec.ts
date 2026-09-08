import { requiresSupabase, test } from './support/fixtures'
import { assertGameScreenFits } from './support/layout-checks'

requiresSupabase()

test('the game screen never scrolls', async ({ page, probe }) => {
  await assertGameScreenFits(page, probe, 'layout')
})
