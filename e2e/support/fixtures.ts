import { appendFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { test as base } from '@playwright/test'
import { ApiUser, discoverAnswer, type Room } from './api'
import { hideDevOverlay } from './app'
import { isSupabaseConfigured } from './env'
import { WireLog } from './wire'

/**
 * Every room this suite makes is named with this prefix and lives forever: no
 * client role may delete or archive a room (see `supabase/migrations/…_rls.sql`
 * — `grant all on public.rooms` goes to `service_role` only), and the test
 * runner deliberately holds no service-role key. `e2e/scripts/cleanup.mjs`
 * removes them when someone supplies one out of band.
 */
export const ROOM_PREFIX = 'E2E'

const ARTIFACTS = path.resolve(import.meta.dirname, '../.artifacts')
const ROOM_LOG = path.join(ARTIFACTS, 'created-rooms.log')

/** Append the room to a local log so a run's leftovers are always knowable. */
function recordRoom(room: Room): void {
  try {
    mkdirSync(ARTIFACTS, { recursive: true })
    appendFileSync(ROOM_LOG, `${new Date().toISOString()}\t${room.code}\t${room.name}\n`)
  } catch {
    // A log that cannot be written must not fail a test.
  }
}

export function testRoomName(label: string): string {
  // rooms.name is 1..40 characters.
  return `${ROOM_PREFIX} ${label} ${Math.random().toString(36).slice(2, 7)}`.slice(0, 40)
}

/**
 * The out-of-band account, shared by every test in a worker.
 *
 * A real project rate limits anonymous sign-ins per IP and room creation per
 * user (10/hour). One account per worker keeps the suite well inside both; it
 * rolls over before it reaches the room limit rather than after.
 */
export class Probe {
  private user: ApiUser | null = null
  private roomsCreated = 0

  private async current(): Promise<ApiUser> {
    if (this.user === null || this.roomsCreated >= 8) {
      this.user = await ApiUser.signUp()
      this.roomsCreated = 0
    }
    return this.user
  }

  /** Create a test room out of band and return it with its host account. */
  async createRoom(label: string): Promise<{ room: Room; user: ApiUser }> {
    const user = await this.current()
    const { room } = await user.createRoom(testRoomName(label), 'Probe')
    this.roomsCreated += 1
    recordRoom(room)
    return { room, user }
  }

  /**
   * Create a room and play its first puzzle to the end, so the test knows the
   * answer the way a finished player does.
   */
  async roomWithKnownAnswer(label: string): Promise<{ room: Room; answer: string }> {
    const { room, user } = await this.createRoom(label)
    const puzzle = await user.getPuzzle(room.id, 5, 1)
    const answer = await discoverAnswer(user, puzzle.id)
    return { room, answer }
  }

  /**
   * Learn the answer to a room that already exists — one the UI just made, so
   * the test never had to see its id.
   */
  async answerFor(code: string, playerName: string): Promise<string> {
    const user = await ApiUser.signUp()
    const { room } = await user.joinRoom(code, playerName)
    const puzzle = await user.getPuzzle(room.id, 5, 1)
    return discoverAnswer(user, puzzle.id)
  }

  /** Note a UI-created room so cleanup can find it too. */
  note(room: Room): void {
    recordRoom(room)
  }
}

interface WorkerFixtures {
  probe: Probe
}

interface TestFixtures {
  /** Every response body and websocket frame this page received. */
  wire: WireLog
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  probe: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright's fixture signature.
    async ({}, use) => {
      await use(new Probe())
    },
    { scope: 'worker' },
  ],

  page: async ({ page }, use) => {
    await hideDevOverlay(page)
    await use(page)
  },

  wire: async ({ page, baseURL }, use) => {
    const log = WireLog.record(page, baseURL ?? 'http://127.0.0.1:3900')
    await use(log)
  },
})

export const expect = test.expect

/** Skip a whole spec when there is no project to run it against. */
export function requiresSupabase(): void {
  test.skip(
    !isSupabaseConfigured(),
    'No Supabase credentials — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
  )
}
