'use client'

import { DEFAULT_PLAYER_SETTINGS, type PlayerSettings } from '@wordroom/shared'
import { useEffect, useRef, useState } from 'react'
import { Switch, toast } from '@/components/ui'
import { GameScreen } from '../components/game-screen'
import { useGameStore } from '../store'
import { createMockGameApi } from './mock-api'

/**
 * The game running against a local double, at `/dev/game`.
 *
 * The counterpart to `/dev/ds`: somewhere to play the board, watch the reveal,
 * check the layout at 375x667 and 360x640, and see the result sheet, without a
 * Supabase project. The room screen that mounts `GameScreen` for real is
 * workstream 3's.
 */
export function DevGame() {
  const configure = useGameStore((state) => state.configure)
  const loadPuzzle = useGameStore((state) => state.loadPuzzle)
  const applySettings = useGameStore((state) => state.applySettings)
  const status = useGameStore((state) => state.status)
  const [settings, setSettings] = useState<PlayerSettings>(DEFAULT_PLAYER_SETTINGS)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    configure({
      room: { id: 'dev-room', name: 'Friday crew', code: 'KHX7' },
      mode: 5,
      settings: DEFAULT_PLAYER_SETTINGS,
      api: createMockGameApi(),
    })
    void loadPuzzle(5, 1)
  }, [configure, loadPuzzle])

  function update(next: PlayerSettings) {
    setSettings(next)
    applySettings(next)
    toast('Applies from your next puzzle')
  }

  return (
    <>
      <GameScreen
        onOpenRoom={() => toast('Room sheet is workstream 3')}
        onOpenLeaderboard={() => toast('Leaderboard is workstream 4')}
        onOpenSettings={() => toast('Settings sheet is workstream 4')}
        leaderboardUpdate
        rank={{ before: 3, after: 2 }}
      />

      {/*
        Harness controls, not product. They stand in for the settings sheet so
        hard mode and the timer can be exercised; they are absolutely positioned
        so they cannot change the game screen's own height budget.
      */}
      <div className="fixed top-2 left-2 z-30 flex flex-col gap-1.5 rounded-md bg-surface/90 px-3 py-2 text-[11px] text-ink-2 shadow-sm backdrop-blur">
        <span className="font-semibold uppercase">harness · {status}</span>
        <div className="flex items-center gap-2">
          <Switch
            checked={settings.hardMode}
            onCheckedChange={(hardMode) => update({ ...settings, hardMode })}
            aria-label="Hard mode"
          />
          Hard mode
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={settings.timerMode !== 'off'}
            onCheckedChange={(on) =>
              update({ ...settings, timerMode: on ? 'per-puzzle' : 'off', perPuzzleSeconds: 60 })
            }
            aria-label="Timer"
          />
          Timer 1:00
        </div>
      </div>
    </>
  )
}
