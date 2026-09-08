'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Player, Room } from '@wordroom/shared'
import { useEffect, useMemo } from 'react'
import { getBrowserClient } from '@/lib/supabase'
import { fetchMembers, fetchMySeats, fetchRoom } from './queries'
import { useSession } from './session'
import { getActiveRoomId, setActiveRoomId } from './storage'

/** Query keys, in one place so a realtime event can invalidate the right one. */
export const roomKeys = {
  seats: (userId: string) => ['rooms', 'seats', userId] as const,
  room: (roomId: string) => ['rooms', 'room', roomId] as const,
  members: (roomId: string) => ['rooms', 'members', roomId] as const,
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
    if (player) setActiveRoomId(player.roomId)
  }, [player])

  return {
    seat: player && room.data ? { room: room.data, player } : null,
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
 */
export function useMembers(roomId: string | null) {
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
    const channel = client
      .channel(`room-members:${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: roomKeys.members(roomId) })
        },
      )
      .subscribe()

    return () => {
      void client.removeChannel(channel)
    }
  }, [roomId, status, queryClient])

  return query
}
