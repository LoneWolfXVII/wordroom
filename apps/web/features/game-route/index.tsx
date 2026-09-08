'use client'

/**
 * The seam where the four feature workstreams meet.
 *
 * Each of them built against an interface and left the other side to whoever
 * wired the app together. Nothing here is game, room, leaderboard or settings
 * logic — it only holds the pieces of sheet state that span two features and
 * passes each one the props it asked for:
 *
 *   - the game store gets the room and a transport built from the browser
 *     session (workstreams 2 and 3);
 *   - the leaderboard sheet gets the room, player and the puzzle on screen,
 *     and hands back the rank delta the result sheet renders (2 and 4);
 *   - the settings sheet gets workstream 3's account row in its footer (3 and 4);
 *   - the save-progress nudge drops into the result sheet (2 and 3).
 *
 * If a feature needs something new from a neighbour, add the prop here rather
 * than importing across feature folders.
 */

import { useEffect, useMemo, useState } from 'react'
import { Button, Screen } from '@/components/ui'
import { createEdgeGameApi, GameScreen, useGameStore } from '@/features/game'
import { createLeaderboardSource, LeaderboardSheet, useRankDelta } from '@/features/leaderboard'
import { RoomSheet, SaveProgressNudge, useActiveSeat } from '@/features/rooms'
import {
  applyPendingSettings,
  createSettingsSource,
  SettingsSheet,
  useSettingsConnection,
  useSettingsStore,
} from '@/features/settings'
import { getBrowserClient, isSupabaseConfigured, supabaseEnv } from '@/lib/supabase'
import { AccountSettingRow } from './account-row'
import { resumePuzzleNumber } from './resume'
import { bindSettingsToGame } from './settings-bridge'

export function GameRoute() {
  const { seat, isLoading } = useActiveSeat()
  const [roomOpen, setRoomOpen] = useState(false)
  const [boardOpen, setBoardOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const configure = useGameStore((s) => s.configure)
  const loadPuzzle = useGameStore((s) => s.loadPuzzle)
  const mode = useGameStore((s) => s.mode)
  const puzzle = useGameStore((s) => s.puzzle)
  const status = useGameStore((s) => s.status)
  const reset = useGameStore((s) => s.reset)

  // `supabaseEnv()` builds a fresh object on every call, so reading it during
  // render gave `env` a new identity each time — which recreated the
  // leaderboard source below, which changed the query's inputs, which rendered
  // again. The leaderboard refetched in a loop, dozens of times a second. The
  // values are build-time constants, so they are read exactly once.
  const env = useMemo(() => (isSupabaseConfigured() ? supabaseEnv() : null), [])

  // One source per client, not one per render: the leaderboard subscribes on it.
  const leaderboardSource = useMemo(() => {
    if (!env) return null
    return createLeaderboardSource(getBrowserClient())
  }, [env])

  /*
   * Settings. The sheet edits workstream 4's store, which persists to
   * `players.settings`; the game snapshots workstream 2's `pendingSettings`
   * onto each new puzzle. Nothing connected either one: the store was never
   * given a source or a player, so the sheet's toggles wrote nowhere, and the
   * game only ever saw the settings on the seat it was configured with. A
   * player could switch the timer on, get the "from next puzzle" toast, play
   * on with no clock, and find both switches off again after a reload.
   *
   * The settings store is the one source of truth here. It is connected to the
   * seat's player, forwarded into the game (`settings-bridge.ts`), and the first
   * puzzle waits for its row to be read so the rules it starts under are the
   * player's own rather than the defaults.
   */
  const settingsSource = useMemo(
    () => (env ? createSettingsSource(getBrowserClient()) : null),
    [env],
  )
  useSettingsConnection(settingsSource, seat?.player.id ?? null)
  const settingsReady = useSettingsStore((s) => s.ready)
  useEffect(() => bindSettingsToGame(), [])

  useEffect(() => {
    if (!seat || !env) return

    const supabase = getBrowserClient()
    configure({
      room: { id: seat.room.id, name: seat.room.name, code: seat.room.code },
      api: createEdgeGameApi({
        functionsUrl: `${env.url.replace(/\/$/, '')}/functions/v1`,
        anonKey: env.anonKey,
        getAccessToken: async () => {
          const { data } = await supabase.auth.getSession()
          return data.session?.access_token ?? null
        },
      }),
    })
  }, [seat, env, configure])

  // Settings changes apply from the next puzzle, never the one in play.
  useEffect(() => {
    if (!puzzle) return
    applyPendingSettings()
  }, [puzzle])

  // Open the puzzle this player is up to, with the board they left. See `resume.ts`.
  // Waits for the player's settings, because `loadPuzzle` snapshots them.
  useEffect(() => {
    if (!seat || !env || !settingsReady || puzzle) return

    let cancelled = false
    void (async () => {
      const { number, restore } = await resumePuzzleNumber(getBrowserClient(), seat.room.id, mode)
      if (!cancelled) await loadPuzzle(mode, number, restore)
    })()

    return () => {
      cancelled = true
    }
  }, [seat, env, settingsReady, puzzle, mode, loadPuzzle])

  const { delta } = useRankDelta({
    source: leaderboardSource,
    roomId: seat?.room.id ?? '',
    mode,
    playerId: seat?.player.id ?? '',
    range: 'week',
    enabled: Boolean(seat) && (status === 'solved' || status === 'failed'),
  })

  if (isLoading) return null

  if (!seat) {
    return (
      <Screen>
        <p className="mt-auto text-[15px] text-ink-2">You are not in a room yet.</p>
        <div className="mt-auto pb-5">
          <Button asChild variant="primary">
            <a href="/">Back to start</a>
          </Button>
        </div>
      </Screen>
    )
  }

  return (
    <>
      <GameScreen
        onOpenRoom={() => setRoomOpen(true)}
        onOpenLeaderboard={() => setBoardOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        rank={delta ? { before: delta.before, after: delta.after } : null}
        nudge={<SaveProgressNudge />}
        showModes={false}
      />

      {/*
       * The room sheet needs two things only the game knows: which puzzle is on
       * screen, so the member list can say who has finished it, and somewhere to
       * put the store back to nothing when a player leaves. The store is module
       * scoped and outlives this route, so without the reset the next room they
       * join would open on this room's puzzle.
       */}
      <RoomSheet
        open={roomOpen}
        onOpenChange={setRoomOpen}
        puzzleId={puzzle?.id ?? null}
        onLeft={reset}
      />

      <LeaderboardSheet
        open={boardOpen}
        onOpenChange={setBoardOpen}
        source={leaderboardSource}
        roomId={seat.room.id}
        playerId={seat.player.id}
        mode={mode}
        puzzleNumber={puzzle?.number ?? null}
      />

      <SettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        footer={<AccountSettingRow returnPath="/game" />}
      />
    </>
  )
}
