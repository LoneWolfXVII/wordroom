// The two stores directly rather than the feature barrels: the barrels export
// components too, and this module is imported by a node-environment test.
import { useGameStore } from '@/features/game/store'
import { useSettingsStore } from '@/features/settings/use-settings'

/**
 * Carry the settings store's value into the game store.
 *
 * Workstream 4's settings store is what the settings sheet edits and what is
 * persisted to `players.settings`. Workstream 2's game store keeps its own
 * `pendingSettings`, snapshotted onto each new puzzle so the rules cannot change
 * under a board in play. Neither knows about the other, and nothing wired them
 * together: a player could switch the timer on, see the "from next puzzle"
 * toast, and never get a clock — the game was still playing the settings it was
 * configured with on mount.
 *
 * This is the one place the two meet. Every time the settings store has a
 * loaded value, it becomes the game's pending settings; `loadPuzzle` picks them
 * up on the next puzzle exactly as before. A value is only forwarded once the
 * store is `ready` — before that it holds defaults for a player whose row has
 * not been read yet, and forwarding those would start the first puzzle with the
 * timer off for someone who left it on.
 */
export function bindSettingsToGame(): () => void {
  const forward = () => {
    const { ready, settings } = useSettingsStore.getState()
    if (ready) useGameStore.getState().applySettings(settings)
  }

  forward()
  return useSettingsStore.subscribe((state, previous) => {
    if (state.ready && (state.settings !== previous.settings || !previous.ready)) forward()
  })
}
