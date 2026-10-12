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

import { FOUR, type Mode } from '@wordroom/shared'
import { useEffect, useMemo, useState } from 'react'
import { Button, Icon, Screen, TileArt } from '@/components/ui'
import { HomeIcon } from '@/components/ui/icons'
import { FourResultSheet, FourScreen, useFourStore } from '@/features/four'
import { createGameApi, GameScreen, readModePreference, useGameStore } from '@/features/game'
import { createLeaderboardSource, LeaderboardSheet, useRankDelta } from '@/features/leaderboard'
import { RoomSheet, SaveProgressNudge, useActiveSeat } from '@/features/rooms'
import {
  applyPendingSettings,
  BuildStamp,
  createSettingsSource,
  SettingsSheet,
  useSettingsConnection,
  useSettingsStore,
} from '@/features/settings'
import {
  fetchWaitStatus,
  isHeld,
  PaceSetting,
  skipRound,
  useWaitStatus,
  WaitingNote,
} from '@/features/wait'
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
  const setMode = useGameStore((s) => s.setMode)

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
  useSettingsConnection(settingsSource, seat?.player.id ?? null, seat?.player.settings)
  const settingsReady = useSettingsStore((s) => s.ready)
  useEffect(() => bindSettingsToGame(), [])

  // One transport for both game stores.
  const api = useMemo(() => {
    if (!env) return null
    const supabase = getBrowserClient()
    return createGameApi({
      restUrl: `${env.url.replace(/\/$/, '')}/rest/v1`,
      anonKey: env.anonKey,
      getAccessToken: async () => {
        const { data } = await supabase.auth.getSession()
        return data.session?.access_token ?? null
      },
    })
  }, [env])

  useEffect(() => {
    if (!seat || !api) return
    // Open on the game the player last picked, so a reload comes back to it.
    const preferred = readModePreference()
    configure({
      room: { id: seat.room.id, name: seat.room.name, code: seat.room.code },
      api,
      ...(preferred === null ? {} : { mode: preferred }),
    })
  }, [seat, api, configure])

  // Four at once has its own store. Open the game this player is up to: its
  // boards are mode-4 puzzles numbered 4(N-1)+1..4N, so the board `resume.ts`
  // finds belongs to game ceil(n / 4).
  const configureFour = useFourStore((s) => s.configure)
  const loadFour = useFourStore((s) => s.load)
  const nextFour = useFourStore((s) => s.next)
  const resetFour = useFourStore((s) => s.reset)
  const fourGame = useFourStore((s) => s.game)
  const fourStatus = useFourStore((s) => s.status)
  const [fourResultOpen, setFourResultOpen] = useState(false)

  // Wait mode: the number this player arrived at, while the room is still
  // finishing the one before it. Loaded as soon as the round ends.
  // Kept with its mode, so switching games drops it.
  const [heldAt, setHeldAt] = useState<{ mode: Mode; number: number } | null>(null)
  // Dropped on a switch, so coming back cannot race the switch's own load.
  if (heldAt !== null && heldAt.mode !== mode) setHeldAt(null)
  const held = heldAt?.mode === mode ? heldAt.number : null

  useEffect(() => {
    if (!seat || !api || mode !== FOUR) return
    configureFour({ roomId: seat.room.id, api })
    if (useFourStore.getState().game !== null) return

    let cancelled = false
    void (async () => {
      const { number } = await resumePuzzleNumber(getBrowserClient(), seat.room.id, FOUR)
      const game = Math.ceil(number / 4)
      if (await arrivesEarly(seat.room.id, FOUR, game)) {
        if (!cancelled) setHeldAt({ mode: FOUR, number: game })
        return
      }
      if (!cancelled) await loadFour(game)
    })()
    return () => {
      cancelled = true
    }
  }, [seat, api, mode, configureFour, loadFour])

  // The result opens when a game ends, as the single board's does.
  useEffect(() => {
    setFourResultOpen(fourStatus === 'won' || fourStatus === 'over')
  }, [fourStatus])

  // Settings changes apply from the next puzzle, never the one in play.
  useEffect(() => {
    if (!puzzle) return
    applyPendingSettings()
  }, [puzzle])

  // Open the puzzle this player is up to, with the board they left. See `resume.ts`.
  // Waits for the player's settings, because `loadPuzzle` snapshots them.
  useEffect(() => {
    if (!seat || !env || !settingsReady || puzzle || mode === FOUR) return

    let cancelled = false
    void (async () => {
      const { number, restore } = await resumePuzzleNumber(getBrowserClient(), seat.room.id, mode)
      if (!restore && (await arrivesEarly(seat.room.id, mode, number))) {
        if (!cancelled) setHeldAt({ mode, number })
        return
      }
      if (!cancelled) await loadPuzzle(mode, number, restore)
    })()

    return () => {
      cancelled = true
    }
  }, [seat, env, settingsReady, puzzle, mode, loadPuzzle])

  const client = useMemo(() => (env ? getBrowserClient() : null), [env])
  const onNumber = mode === FOUR ? (fourGame?.number ?? null) : (puzzle?.number ?? null)
  const finished =
    mode === FOUR
      ? fourStatus === 'won' || fourStatus === 'over'
      : status === 'solved' || status === 'failed'
  // Polls only where it can change something: a Wait room with a finished
  // puzzle or a held arrival, or the open room sheet.
  const [pollWait, setPollWait] = useState(false)
  const wait = useWaitStatus(client, seat?.room.id ?? null, mode, Boolean(seat) && pollWait)
  const inWait = wait.status?.pace === 'wait'
  useEffect(() => {
    setPollWait(roomOpen || (inWait && (finished || held !== null)))
  }, [roomOpen, inWait, finished, held])
  useEffect(() => {
    // Unknown counts as Wait: a prefetch in a Wait room signs the player up.
    useGameStore.setState({ prefetchNext: wait.status?.pace === 'speedrun' })
  }, [wait.status])
  const nextNumber = held ?? (finished && onNumber !== null ? onNumber + 1 : null)
  const holding = nextNumber !== null && isHeld(wait.status, nextNumber)

  // The round ended: open what this player arrived at.
  useEffect(() => {
    if (held === null || wait.status === null || isHeld(wait.status, held)) return
    setHeldAt(null)
    if (mode === FOUR) void loadFour(held)
    else void loadPuzzle(mode, held)
  }, [held, wait.status, mode, loadFour, loadPuzzle])

  const waiting =
    holding && wait.status && client && seat ? (
      <WaitingNote
        status={wait.status}
        onSkip={async () => {
          await skipRound(client, seat.room.id, mode)
          await wait.refresh()
        }}
      />
    ) : undefined

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
        <div className="m-auto max-w-[32ch] text-center">
          <TileArt variant="waiting" />
          <h1 className="text-[19px] leading-tight font-semibold text-ink">
            You are not in a room yet.
          </h1>
          <p className="mt-2 text-[14px] leading-[1.45] text-ink-2">
            Puzzles live inside a room, so that you and your friends get the same words. Create one
            or join with a code.
          </p>
        </div>
        <div className="pb-5">
          <Button asChild variant="primary">
            <a href="/">
              <Icon icon={HomeIcon} size={18} />
              Back to start
            </a>
          </Button>
        </div>
      </Screen>
    )
  }

  return (
    <>
      {mode === FOUR ? (
        <FourScreen
          roomName={seat.room.name}
          mode={mode}
          onModeChange={(next) => void setMode(next)}
          onOpenRoom={() => setRoomOpen(true)}
          onOpenLeaderboard={() => setBoardOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          resultOpen={fourResultOpen}
          onOpenResult={() => setFourResultOpen(true)}
          waiting={waiting}
          result={
            fourGame === null ? null : (
              <FourResultSheet
                open={fourResultOpen}
                onOpenChange={setFourResultOpen}
                game={fourGame}
                roomCode={seat.room.code}
                nudge={<SaveProgressNudge />}
                onNext={() => {
                  setFourResultOpen(false)
                  void nextFour()
                }}
                loadingNext={fourStatus === 'loading'}
                waiting={waiting}
              />
            )
          }
        />
      ) : (
        <GameScreen
          onOpenRoom={() => setRoomOpen(true)}
          onOpenLeaderboard={() => setBoardOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          rank={delta ? { before: delta.before, after: delta.after } : null}
          nudge={<SaveProgressNudge />}
          waiting={waiting}
        />
      )}

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
        puzzleId={mode === FOUR ? (fourGame?.boards[0]?.puzzleId ?? null) : (puzzle?.id ?? null)}
        onLeft={() => {
          reset()
          resetFour()
        }}
        settings={
          client ? (
            <PaceSetting
              client={client}
              roomId={seat.room.id}
              status={wait.status}
              onChanged={() => void wait.refresh()}
            />
          ) : null
        }
      />

      <LeaderboardSheet
        open={boardOpen}
        onOpenChange={setBoardOpen}
        source={leaderboardSource}
        roomId={seat.room.id}
        playerId={seat.player.id}
        mode={mode}
        puzzleNumber={mode === FOUR ? (fourGame?.number ?? null) : (puzzle?.number ?? null)}
      />

      <SettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        footer={
          <>
            <AccountSettingRow returnPath="/game" />
            <BuildStamp />
          </>
        }
      />
    </>
  )
}

/** Whether the room, in Wait mode, has not reached this number yet. */
async function arrivesEarly(roomId: string, mode: Mode, next: number): Promise<boolean> {
  try {
    return isHeld(await fetchWaitStatus(getBrowserClient(), roomId, mode), next)
  } catch {
    // Not worth blocking the game for: the server gate still decides.
    return false
  }
}
