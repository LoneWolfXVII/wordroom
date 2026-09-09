'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Player, Room } from '@wordroom/shared'
import { useEffect, useMemo } from 'react'
import { getBrowserClient } from '@/lib/supabase'
import { fetchPuzzleStatuses } from './puzzle-status'
import { fetchMembers, fetchMySeats, fetchRoom } from './queries'
import { useSession } from './session'
import { getActiveRoom, getActiveRoomId, setActiveRoom } from './storage'

/** Query keys, in one place so a realtime event can invalidate the right one. */
export const roomKeys = {
  seats: (userId: string) => ['rooms', 'seats', userId] as const,
  room: (roomId: string) => ['rooms', 'room', roomId] as const,
  members: (roomId: string) => ['rooms', 'members', roomId] as const,
  puzzleStatus: (puzzleId: string) => ['rooms', 'puzzle-status', puzzleId] as const,
  /** Prefix for every puzzle's statuses, for a realtime event to invalidate. */
  puzzleStatuses: () => ['rooms', 'puzzle-status'] as const,
}

/** Every room this account has a seat in. Empty until the first name is locked. */
export function useMySeats() {
  const { userId, status } = useSession()

  return useQuery({
    queryKey: roomKeys.seats(userId ?? 'anonymous'),
    queryFn: () => fetchMySeats(getBrowserClient(), userId as string),
    enabled: status === 'ready' && userId !== null,
  })
}

export interface ActiveSeat {
  room: Room
  player: Player
}

/**
 * The room to open, and the seat held in it.
 *
 * The stored room id is only a preference about which seat to prefer; if it
 * names a room this account no longer has a row in, the most recent real seat
 * wins and the stored value is corrected. That way clearing site data costs a
 * player nothing, and a stale id cannot strand them on an empty screen.
 */
export function useActiveSeat(): {
  seat: ActiveSeat | null
  isLoading: boolean
  hasAnySeat: boolean
} {
  const seats = useMySeats()
  const player = useMemo(() => {
    const rows = seats.data ?? []
    const preferred = getActiveRoomId()
    return rows.find((row) => row.roomId === preferred) ?? rows[0] ?? null
  }, [seats.data])

  const room = useRoom(player?.roomId ?? null)

  useEffect(() => {
    if (player) {
      // The name goes in as well, because the home screen paints its resume
      // card from this before either query has landed. It is never downgraded
      // back to null while the id is unchanged: between the seats query landing
      // and the room query landing there is no name to hand over, and wiping
      // the one already stored is exactly how the card would start arriving
      // late again.
      const cached = getActiveRoom()
      setActiveRoom({
        id: player.roomId,
        name: room.data?.name ?? (cached?.id === player.roomId ? cached.name : null),
      })
      return
    }

    // Settled, and this account holds no seat anywhere. Whatever is cached is a
    // lie — clear it, or the home screen keeps offering a room to go back to.
    if (!seats.isPending && !seats.isFetching && seats.data !== undefined) setActiveRoom(null)
  }, [player, room.data, seats.isPending, seats.isFetching, seats.data])

  // One object per (player, room), not one per render. The game route keys two
  // effects on this — configuring the store and fetching the puzzle — and a
  // fresh object every render re-ran both: the first `loadPuzzle` set the store
  // to `loading`, that re-rendered the route, the new `seat` re-fired the
  // effect, and every page load asked `get-puzzle` twice and re-read the
  // resume state in between. React Query keeps `data` referentially stable
  // across refetches that return the same rows, so memoising on the two rows
  // is exactly "the seat changed".
  const seat = useMemo(
    () => (player && room.data ? { room: room.data, player } : null),
    [player, room.data],
  )

  return {
    seat,
    // `isPending` is false while a *refetch* runs over already-cached data, so
    // a screen that redirects on `!hasAnySeat` would fire on the stale empty
    // array in the window between locking a name and the invalidated seats
    // query coming back. `isFetching` closes that window: callers only act on
    // a settled answer.
    isLoading: seats.isPending || seats.isFetching || (player !== null && room.isPending),
    hasAnySeat: (seats.data ?? []).length > 0,
  }
}

/** One room by id. Returns null for a room this account is not a member of. */
export function useRoom(roomId: string | null) {
  const { status } = useSession()

  return useQuery({
    queryKey: roomKeys.room(roomId ?? 'none'),
    queryFn: () => fetchRoom(getBrowserClient(), roomId as string),
    enabled: status === 'ready' && roomId !== null,
  })
}

/**
 * The room's members, kept current.
 *
 * `players` is in the `supabase_realtime` publication, so a join arrives as an
 * INSERT rather than on a timer — which is what makes the lobby's "Priya joined"
 * moment real. The payload is not trusted as the new state: it only says
 * something changed, and the query refetches through RLS. A realtime row carries
 * whatever columns the subscriber may select, and refetching keeps that decision
 * in one place.
 *
 * This one channel carries every live signal the room needs — arrivals,
 * departures, and progress on the puzzle on screen — so `usePuzzleStatuses`
 * below subscribes to nothing of its own. Three listeners on one socket, rather
 * than a second subscription per sheet.
 */
export function useMembers(roomId: string | null, myPlayerId?: string | null) {
  const { status } = useSession()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: roomKeys.members(roomId ?? 'none'),
    queryFn: () => fetchMembers(getBrowserClient(), roomId as string),
    enabled: status === 'ready' && roomId !== null,
  })

  useEffect(() => {
    if (status !== 'ready' || !roomId) return

    const client = getBrowserClient()
    const refreshMembers = () => {
      void queryClient.invalidateQueries({ queryKey: roomKeys.members(roomId) })
    }

    const channel = client
      .channel(`room-members:${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` },
        refreshMembers,
      )
      /*
       * Departures, unfiltered — and it has to be unfiltered.
       *
       * A DELETE payload carries only the replica identity, which is the primary
       * key by default. `room_id` is not in it, so a `room_id=eq.<id>` filter has
       * nothing to match and the event is dropped: with the filtered listener
       * alone, everyone else's member list would keep a departed player on it
       * until something else refetched.
       *
       * The payload is ignored entirely — this only says "ask again", and the
       * refetch goes through `players_select_member`, so RLS still decides what
       * comes back. The cost of not filtering is an occasional wasted refetch.
       */
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'players' }, () => {
        refreshMembers()
        void queryClient.invalidateQueries({ queryKey: roomKeys.puzzleStatuses() })
      })
      /*
       * Progress on whatever puzzle is on screen. `attempts` has no `room_id`
       * column to filter on, so this is the same deal: a signal to refetch, never
       * data to merge. Nothing off this socket is read — see `puzzle-status.ts`
       * for why a payload from `attempts` is not something to trust.
       *
       * Except for one field, and only to decide whether to ask at all. Your own
       * guess writes to `attempts`, so this fired on every guess you played and
       * refetched a row you had just been handed the result of — measured
       * against production at 440ms to 915ms, sometimes longer than the guess
       * itself. The payload's `player_id` is still not read as data; it is read
       * as "this is my own write, I already know".
       *
       * A dropped event here costs nothing: the query refetches on mount, on
       * focus, and on every other player's write.
       */
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attempts' }, (payload) => {
        const record = (payload.new ?? payload.old) as { player_id?: unknown } | null
        if (myPlayerId && record?.player_id === myPlayerId) return
        void queryClient.invalidateQueries({ queryKey: roomKeys.puzzleStatuses() })
      })
      .subscribe()

    return () => {
      void client.removeChannel(channel)
    }
  }, [roomId, status, queryClient, myPlayerId])

  return query
}

/**
 * Where each member has got to on one puzzle — the member list's status column.
 *
 * No subscription of its own: the room channel in `useMembers` invalidates this
 * query when an attempt changes, and this hook is only ever rendered alongside
 * that one. `puzzleId` is null whenever there is no puzzle on screen (the lobby,
 * or the game still loading), and then nothing is fetched and every member reads
 * as `waiting`.
 */
export function usePuzzleStatuses(puzzleId: string | null) {
  const { status } = useSession()

  return useQuery({
    queryKey: roomKeys.puzzleStatus(puzzleId ?? 'none'),
    queryFn: () => fetchPuzzleStatuses(getBrowserClient(), puzzleId as string),
    enabled: status === 'ready' && puzzleId !== null,
  })
}
