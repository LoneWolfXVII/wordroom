'use client'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Mode } from '@wordroom/shared'
import { useCallback, useEffect, useState } from 'react'
import { Button, SegmentedControl, SettingRow, toast } from '@/components/ui'
import { call, fetchWaitStatus, listNames, type WaitStatus } from './status'

export { fetchWaitStatus, isHeld, listNames, type Pace, type WaitStatus } from './status'

/**
 * Wait mode: a room plays in rounds. The server holds the rule (`round_gate`);
 * this is the little the screen needs to say so — who is still playing, and
 * the host's controls.
 */

// ponytail: polling, not realtime. Eight players at most, and only while
// someone is looking at a finished puzzle or the room sheet. Move to a realtime
// channel on `room_rounds` if that ever shows up in the database's load.
const POLL_MS = 4000

/**
 * The room's pace and open round for one mode: read once per room and mode,
 * then every few seconds while `polling`.
 */
export function useWaitStatus(
  client: SupabaseClient | null,
  roomId: string | null,
  mode: Mode,
  polling: boolean,
) {
  // Keyed, so switching mode never shows the last mode's round for a moment.
  const key = `${roomId}:${mode}`
  const [state, setState] = useState<{ key: string; status: WaitStatus } | null>(null)

  const refresh = useCallback(async () => {
    if (client === null || roomId === null) return
    try {
      const status = await fetchWaitStatus(client, roomId, mode)
      setState({ key: `${roomId}:${mode}`, status })
    } catch {
      // A missed poll is not worth a toast: the next one will try again.
    }
  }, [client, roomId, mode])

  const status = state?.key === key ? state.status : null

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!polling) return
    void refresh()
    const timer = setInterval(() => void refresh(), POLL_MS)
    return () => clearInterval(timer)
  }, [polling, refresh])

  return { status, refresh }
}

/** "Waiting for Priya and Sam", and the host's way past them. */
export function WaitingNote({ status, onSkip }: { status: WaitStatus; onSkip: () => void }) {
  return (
    <div className="mt-3 text-center text-[13px] text-muted" role="status">
      <p className="m-0">
        {status.waitingFor.length === 0
          ? `The room is still on No. ${status.round}.`
          : `Waiting for ${listNames(status.waitingFor)}`}
      </p>
      {status.isHost ? (
        <Button size="sm" className="mt-2" onClick={onSkip}>
          Skip and go on
        </Button>
      ) : null}
    </div>
  )
}

const PACE_OPTIONS = [
  { value: 'speedrun', label: 'Speedrun' },
  { value: 'wait', label: 'Wait' },
] as const

/** The room sheet's pace row. Only the host can change it. */
export function PaceSetting({
  client,
  roomId,
  status,
  onChanged,
}: {
  client: SupabaseClient
  roomId: string
  status: WaitStatus | null
  onChanged: () => void
}) {
  if (status === null) return null
  const hint =
    status.pace === 'wait'
      ? 'Everyone finishes a puzzle before anyone starts the next.'
      : 'Everyone plays at their own speed.'

  return (
    <SettingRow
      className="mt-2"
      label="Pace"
      hint={status.isHost ? hint : `${hint} The host sets this.`}
      control={
        status.isHost ? (
          <SegmentedControl
            className="w-44"
            label="Pace"
            options={PACE_OPTIONS}
            value={status.pace}
            onValueChange={async (pace) => {
              try {
                await call(client, 'set_room_pace', { p_room_id: roomId, p_pace: pace })
                onChanged()
              } catch (error) {
                toast(error instanceof Error ? error.message : 'Could not change the pace')
              }
            }}
          />
        ) : (
          <span className="text-[15px] text-ink-2">
            {status.pace === 'wait' ? 'Wait' : 'Speedrun'}
          </span>
        )
      }
    />
  )
}

export async function skipRound(client: SupabaseClient, roomId: string, mode: Mode) {
  try {
    await call(client, 'skip_round', { p_room_id: roomId, p_mode: mode })
  } catch (error) {
    toast(error instanceof Error ? error.message : 'Could not skip')
  }
}
