'use client'

import { DEFAULT_PLAYER_SETTINGS, type PlayerSettings } from '@wordroom/shared'
import { useEffect } from 'react'
import { create } from 'zustand'
import { toast } from '@/components/ui'
import { normalizeSettings, settingsEqual } from './settings'
import type { SettingsSource } from './source'

/** Dragging the stepper should not write a row per press. */
const SAVE_DEBOUNCE_MS = 400

interface SettingsState {
  /** What the sheet shows and what is persisted. Edits land here immediately. */
  settings: PlayerSettings
  /**
   * What the puzzle on screen is being played under.
   *
   * Spec v1: "Changes apply from the next puzzle." Hard mode is deferred for the
   * same reason — switching it half way through a puzzle would retroactively
   * invalidate guesses the player has already made.
   */
  active: PlayerSettings
  /** True once the player's row has been read. */
  ready: boolean
  saving: boolean

  /**
   * `known` is the player's settings when the caller already holds them - the
   * seat carries the whole row - which turns the load into no request at all.
   */
  connect: (
    source: SettingsSource | null,
    playerId: string | null,
    known?: unknown,
  ) => Promise<void>
  update: (patch: Partial<PlayerSettings>) => void
  /** Call at the start of every puzzle: pending settings become active. */
  applyPending: () => void
  reset: () => void
}

let source: SettingsSource | null = null
let playerId: string | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null
/** The write the debounce is holding, so a reconnect can flush it rather than drop it. */
let pendingSave: (() => void) | null = null
/** Bumped by every `connect`, so a slow load for a previous player is ignored. */
let connectToken = 0

function flushPendingSave(): void {
  if (saveTimer !== null) clearTimeout(saveTimer)
  saveTimer = null
  const save = pendingSave
  pendingSave = null
  save?.()
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  settings: { ...DEFAULT_PLAYER_SETTINGS },
  active: { ...DEFAULT_PLAYER_SETTINGS },
  ready: false,
  saving: false,

  async connect(nextSource, nextPlayerId, known) {
    const token = ++connectToken
    // An edit still inside its debounce belongs to the player who made it.
    // Write it now, before the module-level target moves to someone else.
    flushPendingSave()
    source = nextSource
    playerId = nextPlayerId
    // Until this player's row has been read the store holds someone else's
    // settings, or the defaults. Neither may be taken for theirs.
    set({ ready: false })
    if (nextSource === null || nextPlayerId === null) return

    // The seat already carries this row. `fetchMySeats` selects `settings`
    // along with everything else about the player, so loading it again is a
    // second read of a row the client is holding - and it was the third
    // `players` request on every page load, next to the roster and the seat
    // itself. Measured against production it cost between 400ms and 2.3s.
    //
    // Still normalised rather than trusted: it is jsonb the client may write.
    if (known !== undefined) {
      const settings = normalizeSettings(known)
      set({ settings, active: { ...settings }, ready: true })
      return
    }

    try {
      const loaded = await nextSource.load(nextPlayerId)
      if (token !== connectToken) return
      // Loading is also the start of a session, so nothing is pending yet.
      set({ settings: loaded, active: { ...loaded }, ready: true })
    } catch {
      if (token !== connectToken) return
      set({ ready: true })
      toast.error('Could not load your settings')
    }
  },

  update(patch) {
    const current = get().settings
    const next = normalizeSettings({ ...current, ...patch })
    if (
      next.timerMode === current.timerMode &&
      next.perPuzzleSeconds === current.perPuzzleSeconds &&
      next.hardMode === current.hardMode
    ) {
      return
    }
    set({ settings: next })

    if (source === null || playerId === null) return
    if (saveTimer !== null) clearTimeout(saveTimer)

    // Captured now, not read when the timer fires: by then `source`, `playerId`
    // and `settings` may all belong to a different seat.
    const saveSource = source
    const savePlayer = playerId
    pendingSave = () => {
      set({ saving: true })
      void saveSource
        .save(savePlayer, next)
        .catch(() => {
          // The local value stands; the next edit retries the write. Losing a
          // preference is worth a toast, not a reverted control under the thumb.
          toast.error('Could not save your settings')
        })
        .finally(() => set({ saving: false }))
    }
    saveTimer = setTimeout(() => {
      saveTimer = null
      const save = pendingSave
      pendingSave = null
      save?.()
    }, SAVE_DEBOUNCE_MS)
  },

  applyPending() {
    set({ active: { ...get().settings } })
  },

  reset() {
    if (saveTimer !== null) clearTimeout(saveTimer)
    saveTimer = null
    pendingSave = null
    connectToken += 1
    source = null
    playerId = null
    set({
      settings: { ...DEFAULT_PLAYER_SETTINGS },
      active: { ...DEFAULT_PLAYER_SETTINGS },
      ready: false,
      saving: false,
    })
  },
}))

/**
 * Settings the current puzzle is being played under.
 *
 * WORKSTREAM 2 reads this, not `settings`: it is the timer mode, limit and
 * hard-mode flag that were in force when the puzzle started, so a change made
 * mid-puzzle cannot alter the rules underneath the player.
 */
export function useActiveSettings(): PlayerSettings {
  return useSettingsStore((state) => state.active)
}

/** True when an edit is waiting for the next puzzle to take effect. */
export function usePendingSettings(): boolean {
  return useSettingsStore((state) => !settingsEqual(state.settings, state.active))
}

/**
 * Promote pending settings to active. WORKSTREAM 2 calls this once per puzzle,
 * as the new puzzle loads.
 */
export function applyPendingSettings(): void {
  useSettingsStore.getState().applyPending()
}

/** Wire the store to Supabase once the player is known. */
export function useSettingsConnection(
  settingsSource: SettingsSource | null,
  currentPlayerId: string | null,
  /** The player's settings if the caller already has them. Saves a round trip. */
  known?: unknown,
): void {
  const connect = useSettingsStore((state) => state.connect)

  useEffect(() => {
    void connect(settingsSource, currentPlayerId, known)
  }, [connect, settingsSource, currentPlayerId, known])
}
