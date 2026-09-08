/**
 * leave-room.
 *
 * Two of these matter more than the rest: a caller who is not in the room must
 * not be able to delete anything, and the response must not be able to carry a
 * puzzle answer. The rest pin down the hard-leave semantics so a future "just
 * flag them as gone" refactor has to argue with a failing test first.
 */

import { assert, assertEquals, assertRejects } from '@std/assert'
import { AppError } from '../_shared/errors.ts'
import { assertAnswerAbsent } from '../_shared/presenters.ts'
import {
  LEAVE_ROOM_LIMIT,
  leaveRoomSchema,
  type LeaveRoomSeat,
  type LeaveRoomStore,
  performLeave,
} from '../leave-room/leave.ts'

const ROOM = '22222222-2222-4222-8222-222222222222'
const OTHER_ROOM = '33333333-3333-4333-8333-333333333333'
const PLAYER = '11111111-1111-4111-8111-111111111111'
const HOST = '44444444-4444-4444-8444-444444444444'
const USER = 'a0000000-0000-4000-8000-000000000000'

interface FakeState {
  /** Keyed `${roomId}:${userId}`. */
  seats: Map<string, LeaveRoomSeat>
  hosts: Map<string, string | null>
  deleted: string[]
}

function fakeStore(state: FakeState): LeaveRoomStore {
  return {
    findSeat(roomId, userId) {
      return Promise.resolve(state.seats.get(`${roomId}:${userId}`) ?? null)
    },
    findHostPlayerId(roomId) {
      return Promise.resolve(state.hosts.get(roomId) ?? null)
    },
    deleteSeat(playerId) {
      state.deleted.push(playerId)
      return Promise.resolve()
    },
  }
}

function seatedState(overrides: Partial<FakeState> = {}): FakeState {
  return {
    seats: new Map([[`${ROOM}:${USER}`, { playerId: PLAYER, playerName: 'Priya' }]]),
    hosts: new Map([[ROOM, HOST]]),
    deleted: [],
    ...overrides,
  }
}

Deno.test('a member leaving has their seat deleted', async () => {
  const state = seatedState()
  const body = await performLeave(fakeStore(state), { roomId: ROOM, userId: USER })

  assertEquals(state.deleted, [PLAYER])
  assertEquals(body.roomId, ROOM)
  assertEquals(body.playerId, PLAYER)
  assertEquals(body.playerName, 'Priya')
  assertEquals(body.wasHost, false)
})

Deno.test('you cannot leave a room you are not in', async () => {
  const state = seatedState()

  const error = await assertRejects(
    () => performLeave(fakeStore(state), { roomId: OTHER_ROOM, userId: USER }),
    AppError,
  )

  assertEquals(error.code, 'not_a_member')
  assertEquals(error.status, 403)
  // The important half: nothing was deleted on the way to the refusal.
  assertEquals(state.deleted, [])
})

Deno.test('a room that does not exist is refused the same way, so ids cannot be probed', async () => {
  const state: FakeState = { seats: new Map(), hosts: new Map(), deleted: [] }

  const missing = await assertRejects(
    () => performLeave(fakeStore(state), { roomId: OTHER_ROOM, userId: USER }),
    AppError,
  )
  const notMine = await assertRejects(
    () => performLeave(fakeStore(seatedState()), { roomId: OTHER_ROOM, userId: USER }),
    AppError,
  )

  assertEquals(missing.code, notMine.code)
  assertEquals(missing.status, notMine.status)
  assertEquals(missing.message, notMine.message)
})

Deno.test('a leaving host is reported, because the room is about to have none', async () => {
  const state = seatedState({ hosts: new Map([[ROOM, PLAYER]]) })
  const body = await performLeave(fakeStore(state), { roomId: ROOM, userId: USER })

  assertEquals(body.wasHost, true)
  assertEquals(state.deleted, [PLAYER])
})

Deno.test('a room with no host at all is left without error', async () => {
  const state = seatedState({ hosts: new Map([[ROOM, null]]) })
  const body = await performLeave(fakeStore(state), { roomId: ROOM, userId: USER })

  assertEquals(body.wasHost, false)
  assertEquals(state.deleted, [PLAYER])
})

Deno.test('the host is read before the delete nulls it', async () => {
  const order: string[] = []
  const store: LeaveRoomStore = {
    findSeat() {
      order.push('findSeat')
      return Promise.resolve({ playerId: PLAYER, playerName: 'Priya' })
    },
    findHostPlayerId() {
      order.push('findHostPlayerId')
      return Promise.resolve(PLAYER)
    },
    deleteSeat() {
      order.push('deleteSeat')
      return Promise.resolve()
    },
  }

  const body = await performLeave(store, { roomId: ROOM, userId: USER })

  assertEquals(order, ['findSeat', 'findHostPlayerId', 'deleteSeat'])
  assertEquals(body.wasHost, true)
})

Deno.test('the response never carries an answer', async () => {
  const body = await performLeave(fakeStore(seatedState()), { roomId: ROOM, userId: USER })

  // The body is four scalars and no more. A new field here is a deliberate act,
  // not something a row spread can add.
  assertEquals(Object.keys(body).sort(), ['playerId', 'playerName', 'roomId', 'wasHost'])

  // Nothing in a leave has any reason to touch `puzzles`, so no answer can be in
  // scope — assert it against a plausible one anyway, the way every other
  // answer-free body in this project is checked.
  for (const answer of ['crane', 'facade', 'decade', 'slate']) {
    assertAnswerAbsent(body, answer)
  }

  assert(!('answer' in body))
  assert(!('guesses' in body))
  assert(!('marks' in body))
  assert(!('seed' in body))
})

Deno.test('the request body is a room id and nothing else', () => {
  assert(leaveRoomSchema.safeParse({ roomId: ROOM }).success)
  assert(!leaveRoomSchema.safeParse({ roomId: 'KHX7' }).success)
  assert(!leaveRoomSchema.safeParse({}).success)

  // An extra field is stripped rather than trusted, so a caller cannot smuggle
  // a player id in and delete somebody else's seat.
  const parsed = leaveRoomSchema.parse({ roomId: ROOM, playerId: HOST })
  assertEquals(Object.keys(parsed), ['roomId'])
})

Deno.test('the rate limit is a real budget', () => {
  assert(LEAVE_ROOM_LIMIT.max > 0)
  assert(LEAVE_ROOM_LIMIT.windowSeconds > 0)
})
