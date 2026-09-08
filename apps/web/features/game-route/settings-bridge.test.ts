import { DEFAULT_PLAYER_SETTINGS, type PlayerSettings } from '@wordroom/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockGameApi } from '@/features/game/dev/mock-api'
import { useGameStore } from '@/features/game/store'
import type { SettingsSource } from '@/features/settings/source'
import { useSettingsStore } from '@/features/settings/use-settings'
import { bindSettingsToGame } from './settings-bridge'

// The settings store toasts on a failed load or save. The UI barrel it imports
// that from is React components, which this node-environment suite cannot parse.
vi.mock('@/components/ui', () => ({
  toast: Object.assign(() => undefined, { error: () => undefined }),
}))

/**
 * The defect this pins: the settings sheet edited one store and the game read
 * another, so a timer or hard-mode change never reached the next puzzle.
 */

const ROOM = { id: 'room-1', name: 'Friday crew', code: 'KHXQ' }

const TIMED: PlayerSettings = { timerMode: 'per-puzzle', perPuzzleSeconds: 120, hardMode: true }

/** A source that answers with whatever the test put in `stored`. */
function source(stored: PlayerSettings): SettingsSource & { saved: PlayerSettings[] } {
  const saved: PlayerSettings[] = []
  return {
    saved,
    load: async () => stored,
    save: async (_playerId, settings) => {
      saved.push(settings)
    },
  }
}

let unbind: (() => void) | null = null

beforeEach(() => {
  useSettingsStore.getState().reset()
  useGameStore.getState().reset()
  useGameStore
    .getState()
    .configure({ room: ROOM, mode: 5, api: createMockGameApi({ latencyMs: 0 }) })
})

afterEach(() => {
  unbind?.()
  unbind = null
})

describe('bindSettingsToGame', () => {
  it('forwards a loaded value to the game as its pending settings', async () => {
    unbind = bindSettingsToGame()
    await useSettingsStore.getState().connect(source(TIMED), 'player-1')

    expect(useGameStore.getState().pendingSettings).toEqual(TIMED)
  })

  it('forwards every edit, so the next puzzle plays under the new rules', async () => {
    unbind = bindSettingsToGame()
    await useSettingsStore.getState().connect(source(DEFAULT_PLAYER_SETTINGS), 'player-1')

    useSettingsStore.getState().update({ timerMode: 'per-guess' })
    expect(useGameStore.getState().pendingSettings.timerMode).toBe('per-guess')

    await useGameStore.getState().loadPuzzle(5, 1)
    expect(useGameStore.getState().timerMode).toBe('per-guess')
  })

  it('does not forward the defaults a store holds before its row has been read', () => {
    unbind = bindSettingsToGame()
    // Simulate the game having been configured from a seat that says "timed".
    useGameStore.getState().applySettings(TIMED)

    useSettingsStore.setState({ settings: { ...DEFAULT_PLAYER_SETTINGS } })
    expect(useGameStore.getState().pendingSettings).toEqual(TIMED)
  })

  it('stops forwarding once unbound', async () => {
    unbind = bindSettingsToGame()
    await useSettingsStore.getState().connect(source(DEFAULT_PLAYER_SETTINGS), 'player-1')
    unbind()
    unbind = null

    useSettingsStore.getState().update({ hardMode: true })
    expect(useGameStore.getState().pendingSettings.hardMode).toBe(false)
  })
})

describe('the settings store when the player changes', () => {
  it('is not ready for the new player until their row has been read', async () => {
    const slow = source(DEFAULT_PLAYER_SETTINGS)
    let release: () => void = () => {}
    slow.load = () =>
      new Promise((resolve) => {
        release = () => resolve(TIMED)
      })

    await useSettingsStore.getState().connect(source(DEFAULT_PLAYER_SETTINGS), 'player-1')
    expect(useSettingsStore.getState().ready).toBe(true)

    const connecting = useSettingsStore.getState().connect(slow, 'player-2')
    expect(useSettingsStore.getState().ready).toBe(false)

    release()
    await connecting
    expect(useSettingsStore.getState().ready).toBe(true)
    expect(useSettingsStore.getState().settings).toEqual(TIMED)
  })

  it('ignores a slow load for a player who is no longer connected', async () => {
    let releaseOld: () => void = () => {}
    const old = source(DEFAULT_PLAYER_SETTINGS)
    old.load = () =>
      new Promise((resolve) => {
        releaseOld = () => resolve(TIMED)
      })

    const first = useSettingsStore.getState().connect(old, 'player-1')
    await useSettingsStore.getState().connect(source(DEFAULT_PLAYER_SETTINGS), 'player-2')
    releaseOld()
    await first

    expect(useSettingsStore.getState().settings).toEqual(DEFAULT_PLAYER_SETTINGS)
  })

  it('saves a debounced edit to the player who made it, not the next one', async () => {
    const mine = source(DEFAULT_PLAYER_SETTINGS)
    const theirs = source(DEFAULT_PLAYER_SETTINGS)
    await useSettingsStore.getState().connect(mine, 'player-1')
    useSettingsStore.getState().update({ hardMode: true })

    // The seat changes inside the 400ms debounce window.
    await useSettingsStore.getState().connect(theirs, 'player-2')
    await new Promise((resolve) => setTimeout(resolve, 500))

    expect(theirs.saved).toEqual([])
  })
})
