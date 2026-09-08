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
import { RoomSheet, SaveProgressNudge, SignInPanel, useActiveSeat } from '@/features/rooms'
import { applyPendingSettings, SettingsSheet } from '@/features/settings'
import { getBrowserClient, isSupabaseConfigured, supabaseEnv } from '@/lib/supabase'

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

  const env = isSupabaseConfigured() ? supabaseEnv() : null

  // One source per client, not one per render: the leaderboard subscribes on it.
  const leaderboardSource = useMemo(() => {
    if (!env) return null
    return createLeaderboardSource(getBrowserClient())
  }, [env])

  useEffect(() => {
    if (!seat || !env) return

    const supabase = getBrowserClient()
    configure({
      room: { id: seat.room.id, name: seat.room.name, code: seat.room.code },
      settings: seat.player.settings,
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

  useEffect(() => {
    if (!seat || !env || puzzle) return
    void loadPuzzle(mode, 1)
  }, [seat, env, puzzle, mode, loadPuzzle])

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
        footer={<SignInPanel returnPath="/game" />}
      />
    </>
  )
}
