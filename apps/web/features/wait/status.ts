import type { SupabaseClient } from '@supabase/supabase-js'
import type { Mode } from '@wordroom/shared'

/** Wait mode's calls and the logic around them, free of React. */

export type Pace = 'speedrun' | 'wait'

export interface WaitStatus {
  pace: Pace
  isHost: boolean
  /** The open round, or null when there is none. */
  round: number | null
  /** Names of the players the open round is waiting for. */
  waitingFor: string[]
}

export async function call(
  client: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { data, error } = await client.rpc(name, args)
  const body = (data ?? {}) as Record<string, unknown>
  const failure = body.error as { message?: string } | undefined
  if (error || failure) throw new Error(failure?.message ?? 'Something went wrong. Try again.')
  return body
}

export async function fetchWaitStatus(
  client: SupabaseClient,
  roomId: string,
  mode: Mode,
): Promise<WaitStatus> {
  const body = await call(client, 'wait_status', { p_room_id: roomId, p_mode: mode })
  return {
    pace: body.pace === 'wait' ? 'wait' : 'speedrun',
    isHost: body.isHost === true,
    round: typeof body.round === 'number' ? body.round : null,
    waitingFor: Array.isArray(body.waitingFor)
      ? body.waitingFor.filter((name): name is string => typeof name === 'string')
      : [],
  }
}

/** Whether puzzle `next` has to wait for the open round to end. */
export function isHeld(status: WaitStatus | null, next: number): boolean {
  return status?.pace === 'wait' && status.round !== null && next > status.round
}

export function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
